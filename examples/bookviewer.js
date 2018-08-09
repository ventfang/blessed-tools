var blessed = require('blessed')
  , contrib = require('../')
  , screen = blessed.screen()
  , colors = require('colors/safe');
var grid = new contrib.grid({rows: 3, cols: 1, screen: screen})
var table = grid.set(0,0,1,1,contrib.table,
   { keys: true
   , fg: 'white'
   , selectedFg: 'white'
   , selectedBg: 'blue'
   , interactive: false
   , label: 'book viewer'
   , border: {type: "line", fg: "cyan"}
   , columnSpacing: 5
   , columnWidth: [12, 12, 12, 12, 12, 12, 12, 20]})

var books = grid.set(0,0,1,1,contrib.table,
   { keys: true
   , fg: 'white'
   , selectedFg: 'white'
   , selectedBg: 'blue'
   , interactive: false
   , label: 'book viewer'
   , border: {type: "line", fg: "cyan"}
   , columnSpacing: 5
   , columnWidth: [12, 12, 12, 12, 12, 12, 12, 20]})

var msgbox = grid.set(1,0,2,1,contrib.log,
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
var ticker_headers = ['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at']

function dolog(msg) {
    msgbox.log(msg);
}

function subAllTicker(conn) {
    var cmd = 'sub.market.all.ticker';
    conn.sendUTF(cmd)
}

function subTopic(conn, pair, channel) {
    var cmd = 'sub.market.'+pair+'.'+channel;
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
            dolog("Received: '" + message.utf8Data + "'");
            var response = JSON.parse(message.utf8Data);
            if (response[0] == 'sub.market.all.ticker') {
                if (response[1] == 'i') {
                    tickers = new Map();
                    var datas = response[3];
                    datas.forEach(function(data) {
                        var ticker = {'pair':data[0], 'price':data[1], 'change':data[4], 'baseVol':data[5], 'quoteVol':data[6],'high':data[7],'low':data[8],'time':data[9]};
                        ticker['color'] = {'price':changes_disp_interval, 'change':changes_disp_interval, 'baseVol':changes_disp_interval, 'quoteVol':changes_disp_interval,'high':changes_disp_interval,'low':changes_disp_interval,'time':changes_disp_interval};
                        tickers.set(ticker['pair'], ticker);
                        subTopic(connection, ticker['pair'], 'depth');
                    });
                    setTimeout(genTickerView, 100);
                } else if (response[1] == 'u') {
                    var data = response[3];
                    var ticker = {'pair':data[0], 'price':data[1], 'change':data[4], 'baseVol':data[5], 'quoteVol':data[6],'high':data[7],'low':data[8],'time':data[9]};
                    if (tickers.has(ticker['pair'])) {
                        var old = tickers.get(ticker['pair']);
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
            }
        }
    });

    if (connection.connected) {
        subAllTicker(connection);
    }
    setTimeout(function() { check_connection(connection) }, 1000)
});

function genTickerView() {
    var rows = []
    //['  pair', 'last', 'change', 'baseVol', 'quoteVol', '24h high', '24h low', 'updated at']
    for (var v of tickers.values()) {
        var color = v['color'];
        cols = []
        cols.push(v['pair'].replace('_','/'));
        if (--color['price'] > 0)
            cols.push(colors.green(v['price']));
        else
            cols.push(v['price']);
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
        rows.push(cols);
    }
    table.setData({headers: ticker_headers, data: rows})
}
setInterval(genTickerView, 1000);

setInterval(function() {
    screen.render()
}, 200)

dolog('Connecting to ' + url);
client.connect(url, null);

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});
screen.render()
