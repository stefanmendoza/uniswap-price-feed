# uniswap-price-feed

Real time price feeds from Uniswap by leveraging Infura

## Setup

Install the dependencies needed to run the project:

```
$ yarn
```

## Getting a Token Feed

In the `index.js` file, [add an entry](https://github.com/stefanmendoza/uniswap-price-feed/blob/wip/src/index.js#L26)
for the token you want to use in a pair. The key should be the symbol you want displayed and the value
should be the token address (not the pair address).

To get a live data feed for a given pair, run the following command:

```
$ yarn start <BASE> <QUOTE>
```

where `<BASE>` is the token you care about and `<QUOTE>` is the asset the token will be denominated in. For example,
if you wanted to track ETH swaps in terms of USDC, you would do:

```
$ yarn start ETH USDC
```

Don't worry if the tokens aren't in the same order on the Uniswap pair, the pair information will be able to be retrieved
regardless of if you're demoninating the swaps in the same or opposite asset as Uniswap.

## Cool Future Improvements

* Dynamic price chart using something like Matplotlib (?) to build a live price feed for visualization
* Clean web page to show pending transaction volume (could be useful to know if incoming buying or selling)
