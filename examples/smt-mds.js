var pako = require('pako');
var blessed = require('blessed')
  , contrib = require('../')
  , screen = blessed.screen()
  , colors = require('colors/safe');
var grid = new contrib.grid({rows: 12, cols: 6, screen: screen})

var page_size = 6;
var cur_page_book = 0;
var books = [];
for (var i=0; i<page_size; ++i) {
    var book = grid.set(0,i,9,1,contrib.book,
        { keys: true
        , fg: 'white'
        , selectedFg: 'white'
        , selectedBg: 'blue'
        , interactive: false
        , label: 'Order Book'
        , border: {type: "line", fg: "cyan"}
        , columnSpacing: 1
        , columnWidth: [5, 17, 17]});
    screen.append(book);
    books.push(book);
}

var stat = grid.set(9,0,1,6,contrib.table,
    { keys: true
        , fg: 'white'
        , selectedFg: 'white'
        , selectedBg: 'blue'
        , interactive: false
        , label: ''
        , border: {type: "line", fg: "cyan"}
        , columnSpacing: 1
        , columnWidth: [200]});
screen.append(stat);
var msgbox = grid.set(10,0,2,6,contrib.log,
   {
    fg: "green"
   , selectedFg: 'white'
   , selectedBg: 'blue'
   })

screen.append(msgbox)

var url = 'wss://api.huobi.pro/ws';
var WebSocketClient = require('websocket').client
var client = new WebSocketClient()
var changes_disp_interval = 3;
var tickers = new Map();
var depths = new Map();
var ticker_headers = ['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at', 'last update']
var book_headers = ['', 'price', 'amount']

var markets = ["btcusdt", "ethusdt", "etcusdt", "dashusdt","eosusdt"]
markets = ["smtusdt", "mdsusdt"]
markets = ["smtbtc", "mdsbtc"]
markets = ["smteth", "mdseth"]
markets = ["smtusdt", "mdsusdt","smtbtc", "mdsbtc","smteth", "mdseth"]
markets.forEach((pair) => {tickers.set(pair, {price:0,updown:0})})

function dolog(msg) {
    msgbox.log(msg);
}

function showRate(elapsed, reqs) {
    var rate = Math.round(reqs/elapsed*1e3)
    var msg = 'time us: ' + elapsed/1e3 + 's' + ', reqs: ' + reqs + ', rate: ' + rate + 'ops'
    msgbox.log(msg);
}

function subStatus(conn) {

}

function subTopic(conn, pairs) {
    pairs.forEach((pair) => {
        var rid = Math.round(Math.random()*10000000000)
        var cmd = {
            "sub": `market.${pair}.depth.step0`,
            "id": `${rid}`
        }
        conn.sendUTF(JSON.stringify(cmd))
        rid = Math.round(Math.random()*10000000000)
        var tick = {
            "sub": `market.${pair}.detail`,
            "id": `${rid}`
        }
        conn.sendUTF(JSON.stringify(tick))
        dolog(JSON.stringify(cmd))
        dolog(JSON.stringify(tick))
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
    if (++last_received > 10) {
        last_received = 0;
        dolog('connection timeout, reconnecting...');
        connection.close(1001);
        connection = null;
        client.connect(url, null);
        return;
    } else if (last_received > 5) {
        dolog('connection idle, sending ping...'+last_received)
        connection.sendUTF(JSON.stringify({"ping":Math.round(new Date().getTime() / 1000,0)}));
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
        if (message.type === 'binary') {
            var data = pako.inflate(message.binaryData, { to: 'string' })
            dolog("Received: '" + data + "'");
            var res = JSON.parse(data);
            if (typeof(res.ping) !== "undefined")
                connection.sendUTF(JSON.stringify({"pong":res.ping}));
            if (typeof(res.ch) === "undefined")
                return
            var ch = res.ch.split('.');
            var pair = ch[1];
            var type = ch[2];

            if (type == 'detail') {
                var data = res.tick;
                var old = tickers.get(pair);
                var ticker = {'pair':pair, 'updown':Number.parseFloat(data.close) - Number.parseFloat(old['price']),'price':data.close};
                tickers.set(pair, ticker);
            } else if (type == 'depth') {
                var data = res.tick;
                let asks = {}
                let bids = {}
                var olddepth = {'asks':{}, 'bids':{}}
                if (depths.has(pair))
                    olddepth = depths.get(pair)
                var changes = 0
                if(data&&data.asks)data.asks.forEach((level) => {
                    var tick = level[0].toString()
                    var status = (olddepth.asks[tick] == null || olddepth.asks[tick][2] != level[1]) ? 1 : 0;
                    if (status != 0) {
                        changes += 1
                        asks[tick] = ['1', tick, colors.red(level[1])];
                    } else
                        asks[tick] = ['1', tick, level[1]];
                });
                if(data&&data.bids)data.bids.forEach((level) => {
                    var tick = level[0].toString()
                    var status = (olddepth.bids[tick] == null || olddepth.bids[tick][2] != level.lots) ? 1 : 0;
                    if (status != 0) {
                        changes += 1
                        bids[tick] = ['1', tick, colors.green(level[1])];
                    } else
                        bids[tick] = ['1', tick, level[1]];
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
    });

    if (connection.connected) {
        subTopic(connection, markets);
    }
    setTimeout(function() { check_connection(connection) }, 1000)
});

function fmtItem(item, decimal, dir) {
    return ' '.repeat(2) + item;
}

function fmtItem2(item, decimal=8) {
    var stripeditem = colors.stripColors(item);
	var idx = stripeditem.indexOf('.');
    if (idx == -1)
        stripeditem = stripeditem + '.0'
    var ppadd = 7 - stripeditem.indexOf('.')
    var prefix = ' '.repeat(ppadd>0?ppadd:0)
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
    var asks = Object.values(depth['asks']).sort((a, b) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,30);
    var bids = Object.values(depth['bids']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a[1])) - Number.parseFloat(colors.stripColors(b[1])) }).slice(0,30);
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

var PROFITS = 0.0
var blinking = 0
function split_pair(pair) {
    quote = pair.substring(3)
    if (pair.endsWith('usdt'))
        quote = pair.substring(pair.length-4)
    base = pair.substring(0,pair.length-quote.length)
    return [base, quote]
}
function showDiifer(pair1, pair2, amount1, amount2) {
    smt = depths.get(pair1)
    mds = depths.get(pair2)
    base1 = split_pair(pair1)[0]
    base2 = split_pair(pair2)[0]

    header = `#${pair1}|${pair2}:`.padEnd(19, ' ')
    if (mds && smt && mds.asks && smt.bids) {
        var smt_asks = Object.keys(smt['asks']).sort((a, b) => { return Number.parseFloat(colors.stripColors(a)) - Number.parseFloat(colors.stripColors(b)) }).slice(0,1);
        var smt_bids = Object.keys(smt['bids']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a)) - Number.parseFloat(colors.stripColors(b)) }).slice(0,1);
        var mds_asks = Object.keys(mds['asks']).sort((a, b) => { return Number.parseFloat(colors.stripColors(a)) - Number.parseFloat(colors.stripColors(b)) }).slice(0,1);
        var mds_bids = Object.keys(mds['bids']).sort((b, a) => { return Number.parseFloat(colors.stripColors(a)) - Number.parseFloat(colors.stripColors(b)) }).slice(0,1);
        smt_bid1 = smt_bids[0]
        smt_ask1 = smt_asks[0]
        mds_bid1 = mds_bids[0]
        mds_ask1 = mds_asks[0]

        diff1 = (mds_ask1 - smt_bid1).toFixed(8)
        diffp1 = smt_bid1 / mds_ask1 

        diff2 = (mds_bid1 - smt_ask1).toFixed(8)
        diffp2 = mds_bid1 / smt_ask1

        // sell smt, buy mds; sell mds, buy smt;
        let profit = PROFITS
        var earn1 = ((amount1 * (diffp1 + profit) - amount1) / amount1 * 100).toFixed(3)
        var earn11 = amount1 * (diffp1 + profit)
        diffp1s = (1/diffp1).toFixed(8)

        // sell mds, buy smt; sell sm:, buy mds;
        var earn2 = ((amount2 * (diffp2 + profit) - amount2) / amount2 * 100).toFixed(3)
        var earn22 = amount2 * (diffp2 + profit)
        diffp2s = (diffp2).toFixed(8)

        blinking ++;
        var msg = `${colors.white(header)}${diff1}*1:${diffp1<0.75&&blinking%10<7 ? colors.inverse(colors.yellow(diffp1s)):colors.red(diffp1s)}|${colors.red((earn11).toFixed(0))}${base2}(${earn1}%)  ${diff2}*1:${diffp2>1.11&&blinking%10<7 ? colors.inverse(colors.yellow(diffp2s)):colors.yellow(diffp2s)}|${colors.red((earn22).toFixed(0))}${base1}(${earn2}%) @(${(profit).toFixed(3)})`
        return colors.green(msg)
        msgbox.log(msg)
    }
}

setInterval(() => {
    genBookViews()
    var msg1 = showDiifer('smtusdt', 'mdsusdt', 70000, 65000)
    var msg2 = showDiifer('smtbtc', 'mdsbtc', 70000, 65000)
    var msg3 = showDiifer('smteth', 'mdseth', 70000, 65000)
    //msgbox.log(`${msg1} ${msg2} ${msg3}`)
    rows = []
    rows.push([`${msg1}`])
    rows.push([`${msg2}`])
    rows.push([`${msg3}`])
    stat.setData({title:'', headers: [''], data: rows});
    screen.render()
}, 50);

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

screen.key(['up', 'u', 'C-c'], function(ch, key) {
    PROFITS = PROFITS + 0.002
});

screen.key(['down', 'd', 'C-c'], function(ch, key) {
    PROFITS = PROFITS - 0.002
});

screen.render()
