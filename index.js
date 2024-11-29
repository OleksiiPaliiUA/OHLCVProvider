import { pro as ccxtProExchanges } from "ccxt";
import { Deque } from "@js-sdsl/deque";
import fs from "fs";

const TIMEFRAMES_IN_MILLISECONDS = Object.freeze({
  "1m": 60000,
});

class BinanceOHLCV {
  symbol;
  timeframe;
  days;
  limit;
  binance;
  deque;
  isReady;
  lastTimestamp;
  loadingPromise;
  watcher;

  constructor(symbol, timeframe = "1m", days = 30, limit = 1000) {
    if (!Object.keys(TIMEFRAMES_IN_MILLISECONDS).includes(timeframe)) {
      this.logger("Incorrect timeframe");
      return;
    }

    this.symbol = symbol;
    this.timeframe = timeframe;
    this.days = days;
    this.limit = limit;
    this.binance = new ccxtProExchanges.binance();
    this.deque = new Deque();
    this.isReady = false;
    this.lastTimestamp = null;
    this.loadingPromise = null;
    this.watcher = null;
    this.start();
  }

  async loadInitialData() {
    const since = this.getTimestampForDaysAgo(this.days);
    let allCandlesLoaded = false;
    let nextCandleTime = since;

    while (!allCandlesLoaded) {
      try {
        const candlesChunk = await this.binance.fetchOHLCV(
          this.symbol,
          this.timeframe,
          nextCandleTime,
          this.limit
        );

        if (candlesChunk.length === 0) {
          allCandlesLoaded = true;
          break;
        }

        candlesChunk.forEach((candle) => this.deque.pushBack(candle));

        nextCandleTime =
          candlesChunk[candlesChunk.length - 1][0] +
          TIMEFRAMES_IN_MILLISECONDS[this.timeframe];

        if (
          this.deque.front()[0] ===
            this.deque.back()[0] + this.days * 24 * 60 * 60 * 1000 ||
          this.deque.size() >= this.days * 24 * 60
        ) {
          allCandlesLoaded = true;
        }
      } catch (error) {
        this.logger("Error while downloading:", error);
        break;
      }

      await this.sleep(500);
    }

    this.removeOldCandles();
    this.isReady = true;
  }

  loadDataInBackground() {
    return new Promise((resolve, reject) => {
      this.loadInitialData()
        .then(() => {
          resolve();
        })
        .catch((error) => {
          this.logger("Error while downloading:", error);
          reject(error);
        });
    });
  }

  async startWatchingForNewOHLCV() {
    try {
      const candles = await this.binance.watchOHLCV(
        this.symbol,
        this.timeframe,
        this.deque.back()[0] + TIMEFRAMES_IN_MILLISECONDS[this.timeframe]
      );

      candles.forEach((candle) => {
        this.deque.pushBack(candle);
        this.lastTimestamp = candle[0];
        const timestamp = new Date(candle[0]).toISOString();
        const open = candle[1];
        const high = candle[2];
        const low = candle[3];
        const close = candle[4];
        const volume = candle[5];

        const row = `${timestamp},${open},${high},${low},${close},${volume}\n`;
        fs.appendFileSync("candles.csv", row);
      });

      this.removeOldCandles();
    } catch (error) {
      this.logger("Error while updating candles:", error);
    }
  }

  getTimestampForDaysAgo(days) {
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }

  isDataAvailable() {
    return this.isReady;
  }

  async start() {
    await this.loadDataInBackground();

    let interval = setInterval(() => {
      if (this.isReady) {
        this.logger(
          `Data for ${this.symbol} in last ${this.days} days loaded!`
        );
        this.startMonitoring();
        clearInterval(interval);
      }
    }, 1000);
  }

  startMonitoring(interval = 10000) {
    this.watcher = setInterval(async () => {
      if (this.isReady) {
        await this.startWatchingForNewOHLCV();
      }
    }, interval);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  removeOldCandles() {
    const sinceDate = this.getTimestampForDaysAgo(this.days);

    for (;;) {
      if (this.deque.front()[0] < sinceDate) {
        this.deque.popFront();
      } else {
        return;
      }
    }
  }

  logger(...args) {
    console.log(`[${BinanceOHLCV.name}]: ${args}`);
  }
}

const binanceOHLCV = new BinanceOHLCV("BTC/USDT");

let oneTime = false;

// Dummy code for testing
setInterval(async () => {
  const available = binanceOHLCV.isDataAvailable();
  if (available) {
    // console.log(binanceOHLCV.deque.size());
    // console.log(binanceOHLCV.deque.back()[0]);
    // console.log(binanceOHLCV.deque.front()[0]);
  }
  if (available && !oneTime) {
    const header = "timestamp,open,high,low,close,volume\n";
    if (!fs.existsSync("candles.csv")) {
      fs.writeFileSync("candles.csv", header);
    }

    for (let i = 0; i < binanceOHLCV.deque.size(); i++) {
      const candle = binanceOHLCV.deque.getElementByPos(i);
      const timestamp = new Date(candle[0]).toISOString();
      const open = candle[1];
      const high = candle[2];
      const low = candle[3];
      const close = candle[4];
      const volume = candle[5];

      const row = `${timestamp},${open},${high},${low},${close},${volume}\n`;
      fs.appendFileSync("candles.csv", row);
    }
    oneTime = true;
  }
}, 10000);
