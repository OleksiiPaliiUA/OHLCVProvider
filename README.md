# OHLCVProvider Documentation

`OHLCVProvider` is a class that helps in fetching and managing OHLCV (Open, High, Low, Close, Volume) data from a cryptocurrency exchange (via `ccxt` library). It supports continuous monitoring and fetching of historical OHLCV data for a given trading symbol over a specified timeframe.

The class uses a deque data structure (from the `@js-sdsl/deque` library) to efficiently store and manage the fetched OHLCV data. It also ensures that outdated data (older than the specified number of days) is removed automatically.

---

## Features

- **Initial Data Load**: Fetches historical OHLCV data for a specific symbol for a set number of days (e.g., 30 days).
- **Continuous Monitoring**: Periodically fetches new OHLCV data and appends it to the deque.
- **Old Data Removal**: Automatically removes data older than the specified number of days.
- **Customizable Timeframe**: Supports different timeframes like `1m` (1 minute), `5m` (5 minutes), etc.
- **Customizable Limit**: You can control the number of candles fetched per request (default is 1000).
- **Easy Access**: Methods to access the data in the deque, including retrieving specific candles or the entire dataset.

---

## Installation

1. Install the required dependencies:

   ```bash
   npm install @js-sdsl/deque ccxt
   ```

---

## Usage

### Creating an Instance

```javascript
import { OHLCVProvider } from "./ohlcv-provider";
import ccxt from "ccxt";

const binanceClient = new ccxt.binance();
const ohlcvProvider = new OHLCVProvider("BTC/USDT", binanceClient);
```

### Constructor Options

- `symbol`: The trading symbol (e.g., `"BTC/USDT"`).
- `ccxtClient`: A `ccxt` exchange client instance (e.g., `ccxt.binance()`).
- `timeframe`: Timeframe for the candles (e.g., `"1m"`, `"5m"`, `"1h"`, `"1d"`). Default is `"1m"`.
- `days`: Number of days to store data for. Default is `7` days.
- `updateInterval`: Interval in milliseconds between each new data request. Default is `10000` (10 seconds).
- `limit`: The maximum number of candles to fetch per request. Default is `1000`.

---

### Example Usage

```javascript
import { OHLCVProvider } from "./ohlcv-provider";
import ccxt from "ccxt";

// Instantiate a Binance client
const binanceClient = new ccxt.binance();

// Create an instance of OHLCVProvider for "BTC/USDT" with default settings
const ohlcvProvider = new OHLCVProvider("BTC/USDT", binanceClient);

// Wait until data is fully loaded
setInterval(async () => {
  const available = ohlcvProvider.isDataAvailable();
  console.log(`Is data available? ${available}`);
  if (available) {
    console.log("Latest candle:", ohlcvProvider.getLast()); // Get the latest candle
  }
}, 5000);

// You can also access specific candles or the full dataset
console.log(ohlcvProvider.getAllInArray()); // Get all candles as an array
console.log(ohlcvProvider.getFirst()); // Get the first candle in the deque
```

---

## Methods

### `isDataAvailable()`

- **Description**: Returns `true` if the data has been fully loaded, otherwise `false`.

### `get(id)`

- **Description**: Retrieve a candle by its position (id) in the deque.
- **Parameters**: `id` – The index of the desired candle.
- **Returns**: The candle at the given position.

### `getLast()`

- **Description**: Retrieve the most recent (latest) candle in the deque.
- **Returns**: The latest candle.

### `getFirst()`

- **Description**: Retrieve the oldest (first) candle in the deque.
- **Returns**: The first candle in the deque.

### `getAllInArray()`

- **Description**: Returns the entire deque as an array. This function is resource-sensitive and may be slow if you have a lot of data.
- **Returns**: An array containing all candles.

### `getAllInDeque()`

- **Description**: Returns the entire deque object. Use this method for direct access to the deque.
- **Returns**: The underlying deque object.

---

## Internal Workflow

1. **Initial Data Load**:

   - When an instance is created, the `#loadInitialData()` method is called. This method fetches historical OHLCV data for the specified `symbol` and stores it in the deque.
   - The data is loaded in chunks, with each request fetching up to the specified `limit` of candles (default is 1000). It continues fetching data until the required number of days of data is collected.

2. **Data Monitoring**:

   - The `#startMonitoring()` method starts a periodic check (using `setInterval`) that will fetch new OHLCV data at the specified `updateInterval` (default 10 seconds).
   - Each time new data is fetched, it is added to the deque.

3. **Removing Old Data**:

   - The `#removeOldCandles()` method ensures that candles older than the specified number of `days` are removed from the deque. This ensures that the deque only stores relevant, recent data.

4. **Error Handling**:
   - Errors during data fetching or updating are logged using the `#logger` method.

---

## Example CSV Export (Optional)

If you want to save the OHLCV data to a CSV file periodically, you can use the following approach:

```javascript
import fs from "fs";

setInterval(() => {
  if (ohlcvProvider.isDataAvailable()) {
    const candles = ohlcvProvider.getAllInArray();
    const header = "timestamp,open,high,low,close,volume\n";
    const rows = candles
      .map((candle) => {
        return `${new Date(candle[0]).toISOString()},${candle[1]},${
          candle[2]
        },${candle[3]},${candle[4]},${candle[5]}\n`;
      })
      .join("");

    // Append data to CSV file
    fs.appendFileSync("candles.csv", header + rows);
  }
}, 60000); // Save data every minute
```

---

## Notes

- **Timeframes**: Only a predefined set of timeframes are supported, such as `"1m"`, `"5m"`, etc. These are defined in the `TIMEFRAMES_IN_MILLISECONDS` constant. You can extend it to support more timeframes if necessary.
- **Rate Limits**: Make sure that the exchange client (e.g., `ccxt.binance()`) is configured with proper rate-limiting to avoid hitting API limits.
- **Dependencies**:
  - `@js-sdsl/deque`: A fast deque implementation used to store and manage the OHLCV data.
  - `ccxt`: A cryptocurrency trading library that provides access to multiple exchanges.

---
