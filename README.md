# uniswap-price-feed

Real time price feeds from Uniswap by leveraging Infura

## Setup

Install the dependencies needed to run the project:

```
$ yarn
```

## Getting a Token Feed

In the [`index.js`](https://github.com/stefanmendoza/uniswap-price-feed/blob/wip/src/index.js) file, add an entry
for the token you want to use in a pair. The key should be the symbol you want displayed and the value
should be the token address (not the pair address).

The following options are available for the command:
```
Required:
--base <SYMBOLS> - A comma-delimited list of assets to track
--quote <SYMBOL> - The quote asset to denominate all transactions in

Optional:
--threshold - The quote threshold for logging transactions.
              This also enables aggregating of an address's trades.
```

Example:
```
$ yarn run start --base FLOW,OM,XAMP --quote ETH --threshold 3.5
```

## Cool Future Improvements

* Dynamic price chart using something like Matplotlib (?) to build a live price feed for visualization
* Clean web page to show pending transaction volume (could be useful to know if incoming buying or selling)
