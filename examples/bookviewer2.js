var blessed = require('blessed')
  , contrib = require('../')
  , screen = blessed.screen()
  , colors = require('colors/safe');
var grid = new contrib.grid({rows: 12, cols: 5, screen: screen})

var page_size = 5;
var cur_page_book = 0;
var books = [];
for (var i=0; i<5; ++i) {
    var book = grid.set(0,i,8,1,contrib.book,
        { keys: true
        , fg: 'white'
        , selectedFg: 'white'
        , selectedBg: 'blue'
        , interactive: false
        , label: 'Order Book'
        , border: {type: "line", fg: "cyan"}
        , columnSpacing: 5
        , columnWidth: [5, 17, 17]});
    screen.append(book);
    books.push(book);
}

var msgbox = grid.set(8,0,4,5,contrib.log,
   {
    fg: "green"
   , selectedFg: 'white'
   , selectedBg: 'blue'
   })

screen.append(msgbox)

var url = 'wss://ws-feed.pro.coinbase.com';
var WebSocketClient = require('websocket').client
var client = new WebSocketClient()
var changes_disp_interval = 3;
var tickers = new Map();
var depths = new Map();
var ticker_headers = ['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at', 'last update']
var book_headers = ['', 'price', 'amount']

var markets = ["BTC-USD","ETH-USD","LTC-USD","BCH-USD","ETC-USD"]
markets.forEach((pair) => {tickers.set(pair, {price:0,updown:0})})

function dolog(msg) {
    msgbox.log(msg);
}

function subStatus(conn) {

}

function subTopic(conn, pairs) {
    var cmd = '{"type":"subscribe","channels":[]}';
    cmd = JSON.parse(cmd)
    var level2_50 = {"name":"level2_50","product_ids":[]}
    var ticker_1000 = {"name":"ticker_1000","product_ids":[]}
    pairs.forEach((pair) => {
        level2_50.product_ids.push(pair)
        ticker_1000.product_ids.push(pair)
    })
    cmd.channels.push(level2_50)
    cmd.channels.push(ticker_1000)
    conn.sendUTF(JSON.stringify(cmd))
}

client.on('connectFailed', function(error) {
    dolog('Connect Failed with ' + error.toString());
    setTimeout(function() { client.connect(url, null); }, 3000);
});

var last_received = 0;
function check_connection(connection) {
    if (++last_received > 10) {
        last_received = 0;
        dolog('connection timeout, reconnecting...');
        connection.close(1001);
        connection = null;
        client.connect(url, null);
        return;
    } else if (last_received > 5) {
        dolog('connection idle, sending ping...'+last_received)
        connection.sendUTF('ping');
    }
    setTimeout(function() {check_connection(connection)}, 1000)
}

client.on('connect', function(connection) {
    dolog('Connected to ' + url);
    connection.on('error', function(error) {
        dolog("Connection Error: " + error.toString());
    });
    connection.on('close', function(code) {
        dolog('Connection Closed ' + code);
    });
    connection.on('message', function(message) {
        last_received = 0;
        if (message.type === 'utf8') {
            dolog("Received: '" + message.utf8Data + "'");
            var res = JSON.parse(message.utf8Data);
            if (res.type == 'snapshot') {
                let asks = {}
                let bids = {}
                res.asks.forEach((level) => {
                    asks[Number.parseFloat(level[0]).toString()] = ['1', level[0], level[1]];
                });
                res.bids.forEach((level) => {
                    bids[Number.parseFloat(level[0]).toString()] = ['1', level[0], level[1]];
                });
                depths.set(res.product_id, {'asks':asks, 'bids':bids})
            } else if(res.type === 'l2update') {
                if(res.changes == null)
                    return;
                res.changes.forEach((item) => {
                    item[1] = Number.parseFloat(item[1]).toString()
                    let level = item[0] == 'buy' ? depths.get(res.product_id)['bids'] : depths.get(res.product_id)['asks'];
                    if (item[2] == '0') {
                        level[colors.gray(item[1])] = [colors.gray('0'),colors.gray(item[1]),colors.gray(item[2])];
                        delete level[item[1]]
                        setTimeout(() => {delete level[colors.gray(item[1])]}, 100);
                    } else {
                        level[item[1]] = ['1',item[1], colors.bold(item[0] == 'BUY' ? colors.green(item[2]):colors.red(item[2]))];
                    }
                });
            } else if (res.type == 'ticker') {
                var old = tickers.get(res.product_id);
                var ticker = {'pair':res.product_id, 'updown':Number.parseFloat(res.price) - Number.parseFloat(old['price']),'price':res.price};
                tickers.set(res.product_id, ticker);
            }
        }
    });

    if (connection.connected) {
        subTopic(connection, markets);
    }
    setTimeout(function() { check_connection(connection) }, 1000)
});

function fmtItem(item, decimal, dir) {
    return item;
}

//["1","0.009543","0.002"]
function genBookView(book, pair) {
    var rows = []
    var depth = {'asks':{}, 'bids':{}}
    if (depths.has(pair))
        depth = depths.get(pair)
    var asks = Object.values(depth['asks']).sort((a, b) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,20);
    var bids = Object.values(depth['bids']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,20);
    if (asks.length < 20) {
        for (var i=0; i<(20-asks.length); ++i)
            rows.push(['','','']);
    }

    asks.reverse().map((d) => {
        var ticks = colors.stripColors(d[0])=='0'?d[1]:colors.red(d[1])
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks), fmtItem(d[2])]);
        if (d[2] == colors.red(colors.stripColors(d[2])))
            d[2] = colors.red(colors.bold(colors.stripColors(d[2])))
        else if (d[2] == colors.bold(colors.red(colors.stripColors(d[2]))))
            d[2] = colors.red(colors.stripColors(d[2]))
        else if(colors.stripColors(d[0])!='0')
            d[2] = colors.stripColors(d[2])
    });

    var ticker = tickers.get(pair)
    if (ticker.updown > 0) {
        rows.push([colors.bgRed(' '.repeat(17)), fmtItem(colors.bold(colors.black(ticker['price']))), '']);
    } else {
        rows.push([colors.bgGreen(' '.repeat(17)), fmtItem(colors.bold(colors.black(ticker['price']))), '']);
    }
    bids.map((d) => {
        var ticks = colors.stripColors(d[0])=='0'?d[1]:colors.green(d[1])
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks), fmtItem(d[2])]);
        if (d[2] == colors.green(colors.stripColors(d[2])))
            d[2] = colors.green(colors.bold(colors.stripColors(d[2])))
        else if (d[2] == colors.bold(colors.green(colors.stripColors(d[2]))))
            d[2] = colors.green(colors.stripColors(d[2]))
        else if(colors.stripColors(d[0])!='0')
            d[2] = colors.stripColors(d[2])
    });
    book.setData({title:pair.replace('-','/'), headers: book_headers, data: rows});
}

function genBookViews() {
    if (tickers.size == 0)
        return;
    var pairs = []
    tickers.forEach((v,k) => {pairs.push(k)});
    var cur_pairs = pairs.slice(cur_page_book*page_size, cur_page_book*page_size+page_size);
    books.forEach((b,i,bs) => {
        if (i < cur_pairs.length)
            genBookView(b, cur_pairs[i])
        else
            genBookView(b, '')
    });
}

setInterval(() => {
    genBookViews()
}, 300);

setInterval(function() {
    screen.render()
}, 100)

dolog('Connecting to ' + url);
client.connect(url, null);

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

screen.key(['left', 'h', 'C-c'], function(ch, key) {
    var pages = Math.round(tickers.size / page_size + 0.5);
    cur_page_book = (cur_page_book + 1) % pages;
});

screen.key(['right', 'l', 'C-c'], function(ch, key) {
    var pages = Math.round(tickers.size / page_size + 0.5);
    cur_page_book = (cur_page_book == 0) ? (pages - 1) : (cur_page_book - 1);
});

screen.render()
