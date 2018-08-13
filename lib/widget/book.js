var blessed = require('blessed')
   , Node = blessed.Node
   , Box = blessed.ScrollableBox
   , stripAnsi = require('strip-ansi')

function Book(options) {

  var self = this

  if (!(this instanceof Node)) {
    return new Book(options);
  }

  options = options || {};
  options.bold = true
  options.alwaysScroll = true;
  options.scrollable = true;
  options.data = { title: 'ETC/BTC',headers: ['', 'price', 'amount'], data: []}
  options.selectedFg = options.selectedFg || 'white'
  options.selectedBg = options.selectedBg || 'blue'
  options.fg = options.fg || 'green'
  options.bg = options.bg || ''
  options.interactive = (typeof options.interactive === "undefined") ? true : options.interactive
  this.options = options
  Box.call(this, options);

  this.rows = blessed.list({
          //height: 0,
          top: 2,
          width: 0,
          left: 1,
          style: { selected: {
                      fg: options.selectedFg
                    , bg: options.selectedBg
                 }
                 , item: {
                      fg: options.fg
                    , bg: options.bg
                 }},
          keys: options.keys,
          vi: options.vi,
          tags: true,
          interactive: options.interactive,
          screen: this.screen
        });

  this.append(this.rows)

  this.on("attach", function() {
    if (self.options.data) {
      self.setData(self.options.data)
    }
  })
}

Book.prototype.focus = function(){
  this.rows.focus();
}

Book.prototype.render = function() {
  if(this.screen.focused == this.rows)
    this.rows.focus()

  this.rows.width = this.width-3
  this.rows.height = this.height-4
  Box.prototype.render.call(this)
}


Book.prototype.setData = function(table) {

  var dataToString = function(d) {
    var str = ""
    d.forEach(function(r, i) {
      var colsize = self.options.columnWidth[i]
        , strip = stripAnsi(r.toString())
        , ansiLen = r.toString().length - strip.length
        , r = r.toString().substring(0, colsize + ansiLen) //compensate for ansi len
        , spaceLength = colsize - strip.length + self.options.columnSpacing
      if (spaceLength < 0) {
        spaceLength = 0;
      }
      //var spaces = new Array(Math.round(spaceLength/2)).join(' ')
      //str += spaces + r + spaces
      var spaces = new Array(spaceLength).join(' ')
      str += r + spaces
    })
    return str
  }

  var formatted = []
  var self = this

  table.data.forEach(function(d) {
    var str = dataToString(d);
    formatted.push(str)
  })
  var columnWidth = dataToString(table.headers).length
  var spaces = new Array(Math.round((columnWidth - table.title.length)/2)).join(' ')
  this.setContent(spaces+table.title+spaces+'\n'+dataToString(table.headers))
  this.rows.setItems(formatted)
  this.rows.select(20);
}

Book.prototype.getOptionsPrototype = function() {
  return  { keys: true
          , fg: 'white'
          , interactive: false
          , label: 'Active Processes'
          , width: '30%'
          , height: '30%'
          , border: {type: "line", fg: "cyan"}
          , columnSpacing: 10
          , columnWidth: [16, 12]
          , data: { headers: ['col1', 'col2']
                  , data: [ ['a', 'b']
                          , ['5', 'u']
                          , ['x', '16.1'] ]}
          }
}

Book.prototype.__proto__ = Box.prototype;

Book.prototype.type = 'book';

module.exports = Book
