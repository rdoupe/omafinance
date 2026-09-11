const test = require("node:test")
const assert = require("node:assert/strict")

const Model = require("../src/Model.js")
// Yahoo request-building and response parsing now live behind the provider.
const Yahoo = require("../src/Providers/Yahoo.js").create(Model)

test("missing numeric values stay missing", () => {
  assert.equal(Model.formatPrice(null, "USD", 2), "-")
  assert.equal(Model.formatPrice(undefined, "USD", 2), "-")
  assert.equal(Model.formatPercent(null), "-")
  assert.equal(Model.formatCompact(""), "-")
  assert.equal(Model.formatCompact("   "), "-")
  assert.equal(Model.changeTone(null), "flat")
  assert.deepEqual(Yahoo.detailStats({}, { quotePage: { beta: null }, insights: {} }), [])
})

test("detail stats are grouped into sections with labeled rows", () => {
  const quote = { currency: "USD", priceHint: 2, fiftyTwoWeekHigh: 200, fiftyTwoWeekLow: 100 }
  const sections = Yahoo.detailStats(quote, {
    quotePage: { marketCap: 1000000000, trailingPE: 25, beta: 1.2 },
    insights: { rating: "buy" }
  })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].title, "", "a single untitled section keeps the pane additive")
  const labels = sections[0].rows.map(r => r.label)
  assert.deepEqual(labels, ["MARKET CAP", "P/E", "52W HIGH", "52W LOW", "BETA", "RATING"])
  assert.ok(sections[0].rows.every(r => typeof r.label === "string" && typeof r.value === "string"))
})

test("zero remains a valid numeric value", () => {
  assert.equal(Model.formatPrice(0, "USD", 2), "$0.00")
  assert.equal(Model.formatPercent(0), "0.00%")
  assert.equal(Model.formatCompact(0), "0")
  assert.equal(Model.changeTone(0), "flat")
})

test("detail changes show amount then parenthesized percent", () => {
  assert.equal(Model.formatChangePair(1.25, 2.5, 100, "USD", 2), "+$2.50 (+1.25%)")
  assert.equal(Model.formatChangePair(-1.25, -2.5, 100, "USD", 2), "-$2.50 (-1.25%)")
  assert.equal(Model.formatChangePair(0, 0, 100, "USD", 2), "$0.00 (0.00%)")
  assert.equal(Model.formatChangePair(null, 2.5, null, "USD", 2), "+$2.50")
})

test("delayed loader stays hidden until the wait elapses while still loading", () => {
  assert.equal(Model.delayedLoaderDelayMs(), 100)
  assert.equal(Model.shouldShowDelayedLoader(false, 1, 200, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 0, 200, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 199, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 200, 100), true)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 150, 100), false)
})

test("retry delay backs off exponentially and respects its ceiling", () => {
  assert.equal(Model.backoffDelay(5000, 0, 60000), 5000)
  assert.equal(Model.backoffDelay(5000, 1, 60000), 10000)
  assert.equal(Model.backoffDelay(5000, 4, 60000), 60000)
  assert.equal(Model.backoffDelay(5000, 20, 60000), 60000)
})

test("insights response validation rejects transport payloads and API errors", () => {
  assert.equal(Yahoo.parseDetail("insights", ""), null)
  assert.equal(Yahoo.parseDetail("insights", "not json"), null)
  assert.equal(Yahoo.parseDetail("insights", JSON.stringify({
    finance: { result: null, error: { code: "Unavailable" } }
  })), null)
  assert.notEqual(Yahoo.parseDetail("insights", JSON.stringify({
    finance: { result: { recommendation: {} }, error: null }
  })), null)
})

test("search includes commodity futures while excluding options", () => {
  const raw = JSON.stringify({
    quotes: [
      {
        symbol: "SI=F",
        shortname: "Silver Futures",
        quoteType: "FUTURE",
        exchange: "CMX",
        exchDisp: "New York Commodity Exchange"
      },
      {
        symbol: "AAPL",
        shortname: "Apple Inc.",
        quoteType: "EQUITY",
        exchange: "NMS",
        exchDisp: "NasdaqGS"
      },
      {
        symbol: "AAPL260918C00200000",
        shortname: "AAPL Call",
        quoteType: "OPTION",
        exchange: "OPR",
        exchDisp: "Options"
      }
    ]
  })

  assert.deepEqual(Yahoo.parseSearch(raw), [
    {
      symbol: "SI=F",
      name: "Silver Futures",
      type: "FUTURE",
      exchange: "New York Commodity Exchange"
    },
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      type: "EQUITY",
      exchange: "NasdaqGS"
    }
  ])
})

test("chart parser does not turn missing quote fields into zero", () => {
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: {
          symbol: "TEST",
          regularMarketPrice: null,
          regularMarketChangePercent: null,
          fulldayPrice: null,
          fulldayChangePercent: null
        },
        indicators: { quote: [{ close: [null, 10, undefined, 11] }] }
      }]
    }
  })

  const quote = Yahoo.parseChart(raw)
  assert.equal(quote.price, null)
  assert.equal(quote.changePercent, null)
  assert.equal(quote.regularPrice, null)
  assert.equal(quote.regularChangePercent, null)
  assert.equal(quote.extendedPrice, null)
  assert.deepEqual(quote.closes, [10, 11])
})

test("chart parser calculates change when Yahoo omits the percentage", () => {
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: {
          symbol: "TEST",
          regularMarketPrice: 105,
          chartPreviousClose: 100,
          regularMarketChangePercent: null,
          currency: "USD"
        },
        indicators: { quote: [{ close: [100, 105] }] }
      }]
    }
  })

  const quote = Yahoo.parseChart(raw)
  assert.equal(quote.price, 105)
  assert.equal(quote.changePercent, 5)
})

test("chart parser keeps Yahoo's reported extended change while calculating the comparison", () => {
  const now = Math.floor(Date.now() / 1000)
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: {
          symbol: "TEST",
          regularMarketPrice: 100,
          regularMarketChange: 2,
          chartPreviousClose: 98,
          fulldayPrice: 102,
          fulldayChange: 2,
          fulldayChangePercent: 1.75,
          hasPrePostMarketData: true,
          currentTradingPeriod: { post: { start: now - 60, end: now + 60 } },
          currency: "USD"
        },
        indicators: { quote: [{ close: [98, 100] }] }
      }]
    }
  })

  const quote = Yahoo.parseChart(raw)
  assert.equal(quote.price, 102)
  assert.equal(quote.change, 2)
  assert.equal(quote.changePercent, 1.75)
  assert.equal(quote.extendedChangePercent, 2)
  assert.equal(quote.hasExtended, true)
  assert.equal(quote.session, "post")
})

test("chart parser preserves the instrument type the meta declares", () => {
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: { symbol: "SPY", instrumentType: "ETF", currency: "USD" },
        indicators: { quote: [{ close: [100, 101] }] }
      }]
    }
  })
  assert.equal(Yahoo.parseChart(raw).instrument, "ETF")

  const noType = JSON.stringify({
    chart: {
      result: [{ meta: { symbol: "TEST" }, indicators: { quote: [{ close: [1] }] } }]
    }
  })
  assert.equal(Yahoo.parseChart(noType).instrument, "")
})

test("bar fields can be shown independently", () => {
  const quote = { price: 241.6, currency: "USD", priceHint: 2, change: 2.94, changePercent: 1.234 }
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, true), "AAPL  $241.60  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, false, true, true), "$241.60  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, true, false, true), "AAPL  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, false), "AAPL  $241.60")
  assert.equal(Model.barLabel("AAPL", quote, false, false, false, false), "$")
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, true, "dollars"), "AAPL  $241.60  +$2.94")
  assert.equal(Model.barLabelTone(quote, true, false, false), "up")
  assert.equal(Model.barLabelTone(quote, false, true, false), "up")
  assert.equal(Model.barLabelTone(quote, false, false, true), "up")
  assert.equal(Model.barLabelTone(quote, false, false, false), "flat")
  assert.equal(Model.barLabelTone(null, true, true, true), "flat")
  assert.equal(Model.barLabelTone({ change: -2.94, changePercent: null }, true, false, false, "dollars"), "down")
})

test("detail quote refresh targets only the active symbol", () => {
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL", "MSFT"], " nvda ", "detail"), ["NVDA"])
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL", "MSFT"], "NVDA", "list"), ["AAPL", "MSFT"])
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL"], "", "detail"), ["AAPL"])
})

test("state parsing normalizes symbols and removes invalid pins", () => {
  const state = Model.parseState(JSON.stringify({
    watchlist: [" aapl ", "AAPL", "msft"],
    pinned: ["MSFT", "missing"],
    detailRange: "1Y"
  }))

  assert.deepEqual(state, {
    watchlist: ["AAPL", "MSFT"],
    pinned: ["MSFT"],
    detailRange: "1Y"
  })
})

test("instrument types map to the classes the pane renders differently", () => {
  assert.equal(Model.instrumentClass("EQUITY"), "equity")
  assert.equal(Model.instrumentClass("ETF"), "etf")
  assert.equal(Model.instrumentClass("CRYPTOCURRENCY"), "crypto")
  assert.equal(Model.instrumentClass("RATE"), "rate")
  assert.equal(Model.instrumentClass("FX"), "fx")
  assert.equal(Model.instrumentClass("BOND"), "")
  assert.equal(Model.instrumentClass(""), "")
  assert.equal(Model.instrumentClass(null), "")
})

function monthlySeries(months, yearlyGrowth) {
  const step = 365 * 86400000 / 12
  const start = 1577836800000 // 2020-01-01 UTC
  const closes = []
  const stamps = []
  for (let i = 0; i <= months; i++) {
    closes.push(100 * Math.pow(1 + yearlyGrowth, i / 12))
    stamps.push(start + i * step)
  }
  return { closes, timestamps: stamps }
}

test("performance computes trailing CAGR, drawdown, and distance from high", () => {
  const up = monthlySeries(24, 1.0) // doubles each year for two years

  const summary = Model.performance(up.closes, up.timestamps)
  assert.ok(Math.abs(summary.y1 - 100) < 0.5, "one-year doubling is ~100% CAGR")
  assert.equal(summary.y3, null, "two years of history cannot back a 3Y claim")
  assert.equal(summary.y5, null)
  assert.equal(summary.y10, null)
  assert.equal(summary.drawdown, 0, "a monotonic series never declines")
  assert.ok(Math.abs(summary.offHigh) < 0.001, "the latest print is the high")
})

test("performance reports a peak-to-trough drawdown and an off-high distance", () => {
  const closes = [100, 120, 90, 110]
  const base = 1577836800000 // 2020-01-01 UTC, epoch milliseconds
  const stamps = [base, base + 86400000, base + 86400000 * 2, base + 86400000 * 3]

  const summary = Model.performance(closes, stamps)
  assert.ok(Math.abs(summary.drawdown - (-25)) < 0.001, "120 -> 90 is a -25% drawdown")
  assert.ok(Math.abs(summary.offHigh - (110 / 120 - 1) * 100) < 0.001)
  assert.equal(summary.y1, null, "days of history is not a one-year horizon")
})

test("performance stays silent when there is no usable series", () => {
  assert.equal(Model.performance(null, null), null)
  assert.equal(Model.performance([], []), null)
  assert.equal(Model.performance([10], null), null)
  assert.equal(Model.performance([null, undefined, ""], null), null)
})

test("performance rows are prerendered and drop unsupported horizons", () => {
  const s = monthlySeries(24, 1.0)
  const rows = Model.performanceRows(s.closes, s.timestamps)

  const labels = rows.map(r => r.label)
  assert.ok(labels.includes("1Y"), "two years back one-year CAGR")
  assert.ok(!labels.includes("3Y CAGR"), "two years cannot back three")
  assert.ok(labels.includes("MAX DRAWDOWN"))
  assert.ok(labels.includes("FROM HIGH"))
  assert.match(rows.find(r => r.label === "1Y").value, /%$/)
  assert.equal(typeof rows.find(r => r.label === "1Y").change, "number")
})
