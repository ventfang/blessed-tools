var blessed = require('blessed')
  , contrib = require('../')
  , screen = blessed.screen()
  , colors = require('colors/safe');
var grid = new contrib.grid({rows: 12, cols: 5, screen: screen})
var table = grid.set(0,0,3,5,contrib.table,
   { keys: true
   , fg: 'white'
   , selectedFg: 'white'
   , selectedBg: 'blue'
   , interactive: false
   , border: {type: "line", fg: "cyan"}
   , columnSpacing: 5
   , columnWidth: [12, 12, 12, 12, 12, 15, 12, 12, 20, 12]})

var page_size = 5;
var cur_page_book = 0;
var books = [];
for (var i=0; i<5; ++i) {
    var book = grid.set(3,i,7,1,contrib.book,
        { keys: true
        , fg: 'white'
        , selectedFg: 'white'
        , selectedBg: 'blue'
        , interactive: false
        , label: 'Order Book'
        , border: {type: "line", fg: "cyan"}
        , columnSpacing: 5
        , columnWidth: [5, 17, 17, 17]});
    screen.append(book);
    books.push(book);
}

var msgbox = grid.set(10,0,2,5,contrib.log,
   {
    fg: "green"
   , selectedFg: 'white'
   , selectedBg: 'blue'
   })

table.focus()
screen.append(table)
screen.append(msgbox)

var url = 'wss://ws.btcexa.com/api/market/ws';
var WebSocketClient = require('websocket').client
var client = new WebSocketClient()
var changes_disp_interval = 3;
var tickers = new Map();
var depths = new Map();
var ticker_headers = ['  pair', 'last', 'CNY', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at', 'last update']
var book_headers = ['', 'price', 'CNY', 'amount']
var markets = ['HT_BTC', 'HT_ETH', 'HT_USDT', 'BTC_USDT', 'ETH_BTC']

var index_prices = {
    'usdt': 6.8,
    'btc': 45000,
    'eth': 1350,
}

function dolog(msg) {
    msgbox.log(msg);
}

function subAllTicker(conn) {
    var cmd = 'sub.market.all.ticker';
    conn.sendUTF(cmd)
}

function subTopic(conn, pair, channel) { var cmd = 'sub.market.'+pair+'.'+channel;
    conn.sendUTF(cmd)
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
            //dolog("Received: '" + message.utf8Data + "'");
            var response = '';
            try {
                if (message.utf8Data != 'pong')
                    response = JSON.parse(message.utf8Data);
            } catch (err) {
                console.log(err)
                console.log(message.utf8Data)
            }
            if (response.length != 4 || response[2] != "OK")
                return;
            if (response[0] == 'sub.market.all.ticker') {
                if (response[1] == 'i') {
                    tickers = new Map();
                    var datas = response[3];
                    datas.forEach(function(data) {
                        var ticker = {'pair':data[0], 'updown':0,'price':data[1], 'change':data[4], 'baseVol':data[5], 'quoteVol':data[6],'high':data[7],'low':data[8],'time':data[9]};
                        ticker['color'] = {'price':changes_disp_interval, 'change':changes_disp_interval, 'baseVol':changes_disp_interval, 'quoteVol':changes_disp_interval,'high':changes_disp_interval,'low':changes_disp_interval,'time':changes_disp_interval};
                        tickers.set(ticker['pair'], ticker);
                        //subTopic(connection, ticker['pair'], 'depth');
                        if (ticker['pair'] == 'BTC_USDT')
                            index_prices['btc'] = index_prices['usdt'] * ticker['price']
                        else if (ticker['pair'] == 'ETH_USDT')
                            index_prices['eth'] = index_prices['usdt'] * ticker['price']
                    });
                    markets.forEach(function(pair){
                        subTopic(connection, pair, 'depth')
                    });
                } else if (response[1] == 'u') {
                    var data = response[3];
                    var ticker = {'pair':data[0], 'price':data[1], 'change':data[4], 'baseVol':data[5], 'quoteVol':data[6],'high':data[7],'low':data[8],'time':data[9]};
                    if (ticker['pair'] == 'BTC_USDT')
                            index_prices['btc'] = index_prices['usdt'] * ticker['price']
                    else if (ticker['pair'] == 'ETH_USDT')
                        index_prices['eth'] = index_prices['usdt'] * ticker['price']
                    if (tickers.has(ticker['pair'])) {
                        var old = tickers.get(ticker['pair']);
                        ticker['updown'] = Number.parseFloat(ticker['price']) - Number.parseFloat(old['price']);
                        ticker['color'] = old['color'];
                        if (ticker['price'] != old['price'])
                            ticker['color']['price'] = changes_disp_interval;
                        if (ticker['change'] != old['change'])
                            ticker['color']['change'] = changes_disp_interval;
                        if (ticker['baseVol'] != old['baseVol'])
                            ticker['color']['baseVol'] = changes_disp_interval;
                        if (ticker['quoteVol'] != old['quoteVol'])
                            ticker['color']['quoteVol'] = changes_disp_interval;
                        if (ticker['high'] != old['high'])
                            ticker['color']['high'] = changes_disp_interval;
                        if (ticker['low'] != old['low'])
                            ticker['color']['low'] = changes_disp_interval;
                        if (ticker['time'] != old['time'])
                            ticker['color']['time'] = changes_disp_interval;
                    }
                    tickers.set(ticker['pair'], ticker);
                }
            } else {
                dolog("Received: '" + message.utf8Data + "'");
                let topic = response[0].split('.');
                if (!response[0].startsWith('sub.market') || topic.length != 4)
                    return;
                if (response[1] == 'i') {
                    let asks = {}
                    let bids = {}
                    let datas = response[3];
                    datas['ask'].forEach((data) => { asks[data[1]] = data; });
                    datas['bid'].forEach((data) => { bids[data[1]] = data; }); depths.set(topic[2], {'asks':asks, 'bids':bids})
                } else if(response[1] == 'u') {
                    if (!depths.has(topic[2]))
                        depths.set(topic[2], {'asks':{}, 'bids':{}})
                    var data = response[3];
                    let level = data[1] == 'BUY' ? depths.get(topic[2])['bids'] : depths.get(topic[2])['asks'];
                    if (data[2][0] == '0') {
                        level[colors.gray(data[2][1])] = [colors.gray(data[2][0]),colors.gray(data[2][1]),colors.gray(data[2][2])];
                        delete level[data[2][1]]
                        setTimeout(() => {delete level[colors.gray(data[2][1])]}, 3000);
                    } else {
                        //level[data[2][1]] = [data[2][0],data[2][1], data[1] == 'BUY' ? colors.bgGreen(data[2][2]):colors.bgRed(data[2][2])];
                        level[data[2][1]] = [data[2][0],data[2][1], colors.bold(data[1] == 'BUY' ? colors.green(data[2][2]):colors.red(data[2][2]))];
                    }
                }
            }
        }
    });

    if (connection.connected) {
        subAllTicker(connection);
    }
    setTimeout(function() { check_connection(connection) }, 1000)
});

function fmtItem(item, decimal, dir) {
    var stripeditem = colors.stripColors(item);
    var prefix = ' '.repeat(8 - stripeditem.indexOf('.'))
    var padding = decimal - (stripeditem.length - stripeditem.indexOf('.'))
    var suffix = '0'.repeat(padding>0?padding:0)
    return prefix + item + (dir == 0 ? colors.gray(suffix) : dir == -1 ? colors.red(suffix) : colors.green(suffix))
}

function get_cny_price(pair, tick) {
    index_price = index_prices['usdt']
    if (pair.endsWith('BTC'))
        index_price = index_prices['btc']
    else if (pair.endsWith('ETH'))
        index_price = index_prices['eth']
    cny_price = tick * index_price
    return cny_price
}

//["1","0.009543","0.002"]
function genBookView(book, pair) {
    var rows = []
    var depth = {'asks':{}, 'bids':{}}
    if (depths.has(pair))
        depth = depths.get(pair)
    var asks = Object.values(depth['asks']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,20);
    var bids = Object.values(depth['bids']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,20);
    if (asks.length < 20) {
        for (var i=0; i<(20-asks.length); ++i)
            rows.push(['','','']);
    }
    var decimal1 = 0;
    var decimal2 = 0;
    asks.map((d) => {
        decimal1 = Math.max(decimal1, colors.stripColors(d[1]).length - colors.stripColors(d[1]).indexOf('.'))
        decimal2 = Math.max(decimal2, colors.stripColors(d[2]).length - colors.stripColors(d[2]).indexOf('.'))
    })
    bids.map((d) => {
        decimal1 = Math.max(decimal1, colors.stripColors(d[1]).length - colors.stripColors(d[1]).indexOf('.'))
        decimal2 = Math.max(decimal2, colors.stripColors(d[2]).length - colors.stripColors(d[2]).indexOf('.'))
    })
    asks.map((d) => {
        var ticks = colors.stripColors(d[0])=='0'?d[1]:colors.red(d[1])
        var cny = get_cny_price(pair, colors.stripColors(d[1]));
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks,decimal1,colors.stripColors(d[0])=='0'?0:-1), fmtItem(cny.toFixed(decimal1),decimal1,0), fmtItem(d[2],decimal2,0)]);
        if (d[2] == colors.red(colors.stripColors(d[2])))
            d[2] = colors.red(colors.bold(colors.stripColors(d[2])))
        else if (d[2] == colors.bold(colors.red(colors.stripColors(d[2]))))
            d[2] = colors.red(colors.stripColors(d[2]))
        else if(colors.stripColors(d[0])!='0')
            d[2] = colors.stripColors(d[2])
    });

    if (asks.length || bids.length) {
        var ticker = {price:'',updown:0}
        if (tickers.has(pair))
            ticker = tickers.get(pair)

        var cny = get_cny_price(pair, colors.stripColors(ticker['price']));
        if (ticker.updown > 0) {
            rows.push([colors.bgRed(' '.repeat(17)), fmtItem(colors.bold(colors.black(ticker['price'])),0,0), colors.black(cny.toFixed(5))]);
        } else {
            rows.push([colors.bgGreen(' '.repeat(17)), fmtItem(colors.bold(colors.black(ticker['price'])),0,0), colors.black(cny.toFixed(5))]);
        }
    }

    bids.map((d) => {
        var ticks = colors.stripColors(d[0])=='0'?d[1]:colors.green(d[1])
        var cny = get_cny_price(pair, colors.stripColors(d[1]));
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks,decimal1,colors.stripColors(d[0])=='0'?0:1), fmtItem(cny.toFixed(decimal1),decimal1,0), fmtItem(d[2],decimal2,0)]);
        if (d[2] == colors.green(colors.stripColors(d[2])))
            d[2] = colors.green(colors.bold(colors.stripColors(d[2])))
        else if (d[2] == colors.bold(colors.green(colors.stripColors(d[2]))))
            d[2] = colors.green(colors.stripColors(d[2]))
        else if(colors.stripColors(d[0])!='0')
            d[2] = colors.stripColors(d[2])
    });
    book.setData({title:pair.replace('_','/'), headers: book_headers, data: rows});
}

function genBookViews() {
    if (tickers.size == 0)
        return;
    var pairs = []
    tickers.forEach((v,k) => {pairs.push(k)});
    pairs.sort((a,b) => {
        return a.substr(a.indexOf('_')+1) < b.substr(b.indexOf('_')+1);
    })
    var cur_pairs = pairs.slice(cur_page_book*page_size, cur_page_book*page_size+page_size);
    cur_pairs = markets
    books.forEach((b,i,bs) => {
        if (i < cur_pairs.length)
            genBookView(b, cur_pairs[i])
        else
            genBookView(b, '')
    });
}

function genTickerView() {
    var rows = []
    var now = new Date().getTime()
    //['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at']
    var sorted_pairs = Array.from(tickers.keys()).sort((a, b) => { 
        aa = a.split('_'); 
        bb = b.split('_'); 
        a1 = aa[0]
        b1 = bb[0]
        return a1.localeCompare(b1);
    });
    for (var pair of sorted_pairs) {
        v = tickers.get(pair)
        var color = v['color'];
        cols = []
        fmtpair = v['pair'].split('_')[0].padStart(4) + ' / ' + v['pair'].split('_')[1].padEnd(4)
        cols.push(fmtpair)
        if (--color['price'] > 0)
            cols.push(colors.green(v['price']));
        else
            cols.push(v['price']);
        cny_price = get_cny_price(pair, colors.stripColors(v['price']))
        cols.push(cny_price.toFixed(5))
        if (--color['change'] > 0)
            cols.push(colors.green(v['change']));
        else
            cols.push(v['change']);
        if (--color['baseVol'] > 0)
            cols.push(colors.green(v['baseVol']));
        else
            cols.push(v['baseVol']);
        if (--color['quoteVol'] > 0)
            cols.push(colors.green(v['quoteVol']));
        else
            cols.push(v['quoteVol']);
        if (--color['high'] > 0)
            cols.push(colors.green(v['high']));
        else
            cols.push(v['high']);
        if (--color['low'] > 0)
            cols.push(colors.green(v['low']));
        else
            cols.push(v['low']);
        if (--color['time'] > 0)
            cols.push(colors.green(new Date(Number.parseInt(v['time'])).toLocaleString()));
        else
            cols.push(new Date(Number.parseInt(v['time'])).toLocaleString());
        var lastupdate = (now - Number.parseInt(v['time']))/1000
        lastupdate = lastupdate > 0 ? Math.round(lastupdate+0.5) : 0;
        lastupdate = lastupdate > 6 ? colors.bgRed(lastupdate) : lastupdate;
        cols.push(lastupdate + 's')
        rows.push(cols);
    }
    table.setData({headers: ticker_headers, data: rows})
}
setInterval(() => {
    genTickerView()
}, 500);

setInterval(() => {
    genBookViews()
    screen.render()
}, 100);

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
