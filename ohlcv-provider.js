import { Deque } from "@js-sdsl/deque";

const TIMEFRAMES_IN_MILLISECONDS = Object.freeze({
  "1m": 60000,
});

const utils = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class OHLCVProvider {
  #symbol;
  #timeframe;
  #days;
  #updateInterval;
  #limit;
  #ccxtClient;
  #deque;
  #isReady;
  #watcher;

  /**
   * @param symbol - Trade symbol
   * @param ccxtClient - ccxt client (Must has fetchOHLCV method)
   * @param timeframe - Candle timeframe (Default: '1m')
   * @param days - Amount of days to store data (Default: 30)
   * @param updateInterval - Time between every new request (Default: 10000)
   * @param limit - Limit of candles per request (Default: 1000)
   * @example
   * const ohlcvProvider = new OHLCVProvider("BTC/USDT",new ccxt.pro.binance());
   */
  constructor(
    symbol,
    ccxtClient,
    timeframe = "1m",
    days = 7,
    updateInterval = 10000,
    limit = 1000
  ) {
    if (!Object.keys(TIMEFRAMES_IN_MILLISECONDS).includes(timeframe)) {
      throw new Error("Incorrect timeframe");
    }

    this.#symbol = symbol;
    this.#ccxtClient = ccxtClient;
    this.#timeframe = timeframe;
    this.#days = days;
    this.#updateInterval = updateInterval;
    this.#limit = limit;
    this.#deque = new Deque();
    this.#isReady = false;
    this.#watcher = null;
    this.#start();
  }

  async #loadInitialData() {
    const since = this.#getTimestampForDaysAgo(this.#days);
    let allCandlesLoaded = false;
    let nextCandleTime = since;

    while (!allCandlesLoaded) {
      try {
        const candlesChunk = await this.#ccxtClient.fetchOHLCV(
          this.#symbol,
          this.#timeframe,
          nextCandleTime,
          this.#limit
        );

        if (candlesChunk.length === 0) {
          allCandlesLoaded = true;
          break;
        }

        candlesChunk.forEach((candle) => this.#deque.pushBack(candle));

        nextCandleTime =
          candlesChunk[candlesChunk.length - 1][0] +
          TIMEFRAMES_IN_MILLISECONDS[this.#timeframe];

        if (
          this.#deque.front()[0] ===
            this.#deque.back()[0] + this.#days * 24 * 60 * 60 * 1000 ||
          this.#deque.size() >= this.#days * 24 * 60
        ) {
          allCandlesLoaded = true;
        }
      } catch (error) {
        this.#logger("Error while downloading:", error);
        break;
      }

      await utils.sleep(500);
    }

    this.#removeOldCandles();
    this.#isReady = true;
  }

  #loadDataInBackground() {
    return new Promise((resolve, reject) => {
      this.#loadInitialData()
        .then(() => {
          resolve();
        })
        .catch((error) => {
          this.#logger("Error while downloading:", error);
          reject(error);
        });
    });
  }

  async #startWatchingForNewOHLCV() {
    try {
      const candles = await this.#ccxtClient.fetchOHLCV(
        this.#symbol,
        this.#timeframe,
        this.#deque.back()[0] + TIMEFRAMES_IN_MILLISECONDS[this.#timeframe],
        this.#limit
      );

      candles.forEach((candle) => this.#deque.pushBack(candle));

      this.#removeOldCandles();
      this.#isReady = true;
    } catch (error) {
      this.#logger("Error while updating candles:", error);
      this.#isReady = false;
    }
  }

  #getTimestampForDaysAgo(days) {
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }

  async #start() {
    await this.#loadDataInBackground();

    let interval = setInterval(() => {
      if (this.#isReady) {
        this.#logger(
          `Data for ${this.#symbol} in last ${this.#days} days loaded!`
        );
        this.#startMonitoring();
        clearInterval(interval);
      }
    }, 1000);
  }

  #startMonitoring() {
    this.#watcher = setInterval(async () => {
      if (this.#isReady) {
        await this.#startWatchingForNewOHLCV();
      }
    }, this.#updateInterval);
  }

  #removeOldCandles() {
    const sinceDate = this.#getTimestampForDaysAgo(this.#days);

    for (;;) {
      if (this.#deque.front()[0] < sinceDate) {
        this.#deque.popFront();
      } else {
        return;
      }
    }
  }

  #logger(...args) {
    console.log(`[${OHLCVProvider.name}]: ${args}`);
  }

  isDataAvailable() {
    return this.#isReady;
  }

  get(id) {
    return this.#deque.getElementByPos(id);
  }

  getLast() {
    return this.#deque.back();
  }

  getFirst() {
    return this.#deque.front();
  }

  /**
   * @description Very resource sensitive function
   */
  getAllInArray() {
    const array = [];

    this.#deque.forEach((element) => {
      array.push(element);
    });

    return array;
  }

  getAllInDeque() {
    return this.#deque;
  }
}
