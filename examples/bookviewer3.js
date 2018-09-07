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
        , columnWidth: [5, 15, 17, 17, 17]});
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

var url = 'wss://api.rightbtc.com/quote-websocket/BTCUSD/0/12456789/websocket'
var WebSocketClient = require('websocket').client
var client = new WebSocketClient()
var changes_disp_interval = 3;
var tickers = new Map();
var depths = new Map();
var ticker_headers = ['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at', 'last update']
var book_headers = ['', 'price', 'amount']

var markets = ["BTCUSD"]
//markets = ['ZGCETP']
markets.forEach((pair) => {
    tickers.set(pair, {price:0,updown:0})
    url = 'wss://api.rightbtc.com/quote-websocket/' + pair + '/0/12456789/websocket';
})

function dolog(msg) {
    msgbox.log(msg);
}

function showRate(elapsed, reqs, changes) {
    var rate = Math.round(reqs/elapsed*1e3)
    var msg = 'time us: ' + elapsed/1e3 + 's' + ', reqs: ' + reqs + ', rate: ' + rate + 'ops, changes: ' + changes 
    msgbox.log(msg);
}

function subTopic(conn, pairs) {
    var sub = String.raw `["SUBSCRIBE\nid:sub-0\ndestination:/user/quote/depth\n\n\u0000"]`
    conn.sendUTF(sub);
    pairs.forEach((pair) => {
        var cmd = String.raw `["SUBSCRIBE\nid:sub-9\ndestination:/quote/quote.${pair}.depth.8\n\n\u0000"]`
        dolog(cmd);
        conn.sendUTF(cmd);
        var snd = String.raw `["SEND\ndestination:/quote/depth\ncontent-length:37\n\n{\"symbol\": \"${pair}\",\"type\":\"default\"}\u0000"]`
        conn.sendUTF(snd);
    })
}

client.on('connectFailed', function(error) {
    dolog('Connect Failed with ' + error.toString());
    setTimeout(function() { client.connect(url, null); }, 3000);
});

var ben_counter = 0;
var ben_timer = 0;
var last_received = 0;
function check_connection(connection) {
    if (++last_received > 20) {
        last_received = 0;
        dolog('connection timeout, reconnecting...');
        connection.close(1001);
        connection = null;
        client.connect(url, null);
        return;
    } else if (last_received > 5) {
        dolog('connection idle, sending ping...'+last_received)
        connection.sendUTF('["\\n"]');
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
            var s = message.utf8Data;
            if (s == 'o') {
                connection.sendUTF(String.raw `["CONNECT\naccept-version:1.1,1.0\nheart-beat:10000,10000\n\n\u0000"]`);
                return;
            }
            if (!s.startsWith('a'))
                return;
            if (s == 'a["\\n"]') {
                connection.sendUTF('["\\n"]');
                dolog('[ACK]')
                return;
            }
            if (s.lastIndexOf('\\u0000') == -1)
                return;

            var res = JSON.parse(s.substr(1))[0].split('\n');
            if (res[0] == 'CONNECTED') {
                subTopic(connection, markets);
            } else if (res[0] == 'MESSAGE') {
                var data = JSON.parse(res[res.length-1].replace('\0',''))
                if (data.code == 200) {
                    var redes = /destination:(.*)\n/;
                    var re = /quote\.(.*)\.depth/;
                    var exec = re.exec(s);
                    var pair = exec!=null ? exec[1] : markets[0];
                    let asks = {}
                    let bids = {}
                    var olddepth = {'asks':{}, 'bids':{}}
                    if (depths.has(pair))
                        olddepth = depths.get(pair)
                    if (exec == null)
                        data = data.data
                    var changes = 0
                    if(data&&data.data&&data.data.ask)data.data.ask.forEach((level) => {
                        var tick = Number.parseFloat(level.ticks).toString()
                        var status = (olddepth.asks[tick] == null || olddepth.asks[tick][2] != level.lots) ? 1 : 0;
                        if (status != 0) {
                            changes += 1
                            asks[tick] = ['1', tick, colors.red(level.lots), level.totalLots, level.addTotalLots];
                        } else
                            asks[tick] = ['1', tick, level.lots, level.totalLots, level.addTotalLots];
                    });
                    if(data&&data.data&&data.data.bid)data.data.bid.forEach((level) => {
                        var tick = Number.parseFloat(level.ticks).toString()
                        var status = (olddepth.bids[tick] == null || olddepth.bids[tick][2] != level.lots) ? 1 : 0;
                        if (status != 0) {
                            changes += 1
                            bids[tick] = ['1', tick, colors.green(level.lots), level.totalLots, level.addTotalLots];
                        } else
                            bids[tick] = ['1', tick, level.lots, level.totalLots, level.addTotalLots];
                    });

                    Object.keys(olddepth.asks).forEach((tick) => {
                        tick = colors.stripColors(tick)
                        if (asks[tick] == null) {
                            asks[colors.gray(tick)] = [colors.gray('0'), colors.gray(tick), 0,0,0];
                            setTimeout(() => {delete asks[colors.gray(tick)]}, 100);
                            changes += 1
                        }
                    })

                    Object.keys(olddepth.bids).forEach((tick) => {
                        tick = colors.stripColors(tick)
                        if (bids[tick] == null) {
                            bids[colors.gray(tick)] = [colors.gray('0'), colors.gray(tick), 0,0,0];
                            setTimeout(() => {delete bids[colors.gray(tick)]}, 100);
                            changes += 1
                        }
                    })

                    ben_counter += changes
                    depths.set(pair, {'asks':asks, 'bids':bids})
                    if (ben_timer == 0)
                        ben_timer = new Date().getTime()
                    var elapsed = new Date().getTime() - ben_timer
                    showRate(elapsed, ben_counter, changes)
                }
            }
        }
    });

    setTimeout(function() { check_connection(connection) }, 1000)
});

function fmtItem(item, decimal, dir) {
    return item;
}

function fmtItem2(item, decimal=8) {
    var stripeditem = colors.stripColors(item);
	var idx = stripeditem.indexOf('.');
    if (idx == -1)
        stripeditem = stripeditem + '.0'
    var prefix = ' '.repeat(8 - stripeditem.indexOf('.'))
    var padding = decimal - (stripeditem.length - stripeditem.indexOf('.'))
    var suffix = ' '.repeat(padding>0?padding:0)
    return prefix + item + colors.gray(suffix)
}

//["1","0.009543","0.002"]
function genBookView(book, pair) {
    if (pair == '')
        return;
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
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks), fmtItem2(d[2])]);
        if (d[2] == colors.red(colors.stripColors(d[2])))
            d[2] = colors.red(colors.bold(colors.stripColors(d[2])))
        else if (d[2] == colors.bold(colors.red(colors.stripColors(d[2]))))
            d[2] = colors.red(colors.stripColors(d[2]))
        else if(colors.stripColors(d[0])!='0')
            d[2] = colors.stripColors(d[2])
    });

    var ticker = tickers.get(pair)
    if (ticker.updown > 0) {
        rows.push([colors.bgRed(' '.repeat(17)), colors.bold(colors.black(ticker['price'])), '']);
    } else {
        rows.push([colors.bgGreen(' '.repeat(17)), colors.bold(colors.black(ticker['price'])), '']);
    }
    bids.map((d) => {
        var ticks = colors.stripColors(d[0])=='0'?d[1]:colors.green(d[1])
        rows.push([d[0].padStart(d[0].length-colors.stripColors(d[0]).length+5), fmtItem(ticks), fmtItem2(d[2])]);
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
