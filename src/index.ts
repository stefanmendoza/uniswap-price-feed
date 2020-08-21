import Web3 from 'web3';
import { BlockTransactionString, TransactionReceipt } from 'web3-eth'
var web3 = new Web3(new Web3.providers.WebsocketProvider('wss://mainnet.infura.io/ws/v3/' + process.env.UNISWAP_FEED_INFURA_PROJECT_ID));

import { BigNumber } from 'bignumber.js'

import { ChainId, Fetcher, Pair, Token} from '@uniswap/sdk'

import yargs from 'yargs'
const argv = yargs.options({
  base: { type: 'string', demandOption: true },
  quote: { type: 'string', demandOption: true },
  threshold: { type: 'number' },
  colours: { type: 'string' }
}).argv;

const exit = yargs.exit

import { erc20_abi, symbolToAddressMap } from './constants'

export interface TrackedToken {
  address: string
  symbol: string | undefined
  decimals: number
}

export interface TokenPair {
  address: string
  baseAssetSymbol: string | undefined
  quoteAssetSymbol: string | undefined
}

export interface TrackedTokenPair {
  uniswap: TokenPair
  subscribed: { [key: string]: TrackedToken }
}

/**
 * TODO - Documentation
 */
const transferSHA: string | null = web3.utils.sha3('Transfer(address,address,uint256)')

var lastPrice: number

/**
 * TODO - Documentation
 */
const blockTimestamps: { [key: number]: string } = {}

/**
 * TODO - Documentation
 */
const processedTransactions: string[] = []

/**
 * TODO - Documentation
 */
const whale_swaps = {}

/**
 * TODO - Documentation
 * 
 * @param {number} ms 
 */
function sleep(ms: number): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * TODO - Documentation
 * 
 * @param {web3.eth.Contract} contract the token contract
 * @returns {Promise<number>} the token decimals
 */
async function getTokenDecimals(contract: web3.eth.Contract): Promise<number> {
  try {
    return await contract.methods.decimals().call()
  } catch (e) {
    console.log(`Error: ${e}`)
  }
}

/**
 * TODO - Documentation
 * 
 * @param {*} tokenSymbol 
 */
async function getToken(tokenSymbol: string): Promise<Token> {
  console.log(`Retrieving contract information: ${tokenSymbol}`)

  var tokenAddress: string = symbolToAddressMap[tokenSymbol]
  if (!web3.utils.checkAddressChecksum(tokenAddress)) {
    tokenAddress = web3.utils.toChecksumAddress(tokenAddress)
  }

  const tokenContract = new web3.eth.Contract(erc20_abi, tokenAddress)
  console.log("Contract information retrieved.")

  const tokenDecimals = await getTokenDecimals(tokenContract)
  console.log(tokenDecimals)

  return new Token(ChainId.MAINNET, tokenAddress, tokenDecimals, tokenSymbol)
}

/**
 * TODO - Documentation
 * 
 * @param {*} baseAsset 
 * @param {*} quoteAsset 
 */
async function getUniswapPairInfo(baseAsset: Token, quoteAsset: Token) {
  console.log("\nRetrieving Uniswap pair information...")

  const pair = await Fetcher.fetchPairData(baseAsset, quoteAsset)
  const pairAddress = Pair.getAddress(baseAsset, quoteAsset)

  console.log("Uniswap pair information retrieved.")

  var pairBaseSymbol: string | undefined
  var pairQuoteSymbol: string | undefined
  if (pair.token0.address === baseAsset.address) {
    pairBaseSymbol = baseAsset.symbol
    pairQuoteSymbol = quoteAsset.symbol
  } else {
    pairBaseSymbol = quoteAsset.symbol
    pairQuoteSymbol = baseAsset.symbol
  }

  const uniswapPairInfo: TrackedTokenPair = {
    'uniswap': {
      'address': pairAddress,
      'baseSymbol': pairBaseSymbol,
      'quoteSymbol': pairQuoteSymbol
    },
    'subscribed': {
      'base': {
        'address': baseAsset.address,
        'symbol': baseAsset.symbol,
        'decimals': baseAsset.decimals
      },
      'quote': {
        'address': quoteAsset.address,
        'symbol': quoteAsset.symbol,
        'decimals': quoteAsset.decimals
      }
    }
  }
}

/**
 * TODO - Documentation
 * 
 * @param {*} blockNumber 
 * @param {*} retries 
 */
async function getBlock(blockNumber: number, retries: number): Promise<BlockTransactionString> {
  const block = await web3.eth.getBlock(blockNumber)

  if (block != null) {
    return block;
  }

  if (retries == 0) {
    return null;
  } else {
    // console.log(`Received null for while attempting to retrieve block ${blockNumber}. Retrying.`)
    // Wait 2.5 seconds in case Infura nodes are lagging
    // See: https://github.com/INFURA/infura/issues/43#issuecomment-350521106
    await sleep(2500)

    return getBlock(blockNumber, retries - 1)
  }
}

/**
 * TODO - Documentation
 * 
 * @param {*} baseAsset 
 * @param {*} quoteAsset 
 * @param {*} uniswapPair 
 * @param {*} quoteSizeThreshold 
 */
async function subscribe(baseAsset: TrackedToken, quoteAsset: TrackedToken, uniswapPair: TokenPair, quoteSizeThreshold: number) {
  const pairTicker = `${uniswapPair.baseAssetSymbol}-${uniswapPair.quoteAssetSymbol}`

  web3.eth.subscribe('logs', {
    'address': [
      uniswapPair.address
    ],
  }, function (error, result) {
    if (error) {
      console.log(`Failed to subscribe to pair ${pairTicker}: ${error}`)
    } else {
      console.log(`Subscribed to Uniswap pair: ${pairTicker} (${uniswapPair.address})`)
    }
  })
    .on("data", async function (log) {
      const txHash = log.transactionHash
      const blockNumber = log.blockNumber


      if (!(blockNumber in blockTimestamps)) {
        const block: BlockTransactionString = await getBlock(log.blockNumber, 5)
        const timestamp: number = parseFloat(block.timestamp.toString())

        const rawUtcDate = new Date(timestamp * 1000).toISOString()
        blockTimestamps[blockNumber] = `${rawUtcDate.slice(0, 10)} ${rawUtcDate.split('T')[1].slice(0, 8)}`
      }

      web3.eth.getTransactionReceipt(txHash).then(receipt => {
        if (receipt != null) {
          if (!(processedTransactions.includes(txHash))) {
            handleTransaction(receipt, blockTimestamps[blockNumber], quoteSizeThreshold, baseAsset, quoteAsset)
            processedTransactions.push(txHash)
          } else {
            // console.log(`Received duplicate tx: ${txHash}`)
          }
        } else {
          // console.log("TX was null")
        }
      })
    })
    .on("changed", function (log) {
      // console.log("Got a changed event???")
      // console.log(log)
    });
}

/**
 * TODO - Documentation
 * 
 * @param {*} amount 
 * @param {*} decimals 
 */
function prettifyAmount(amount: BigNumber, decimals: number) {
  // console.log(`Amount: ${amount} (type=${typeof amount})`)
  // console.log(`Decimals: ${decimals} (type=${typeof decimals})`)

  if (amount > 1) {
    if (decimals < 6) {
      return amount.toFixed(decimals)
    } else {
      return amount.toFixed(6)
    }
  } else {
    return amount.toFixed(8)
  }
}

/**
 * TODO - Documentation
 * 
 * @param {*} txReceipt 
 * @param {*} timestamp 
 * @param {*} quoteSizeThreshold 
 * @param {*} baseAsset 
 * @param {*} quoteAsset 
 */
async function handleTransaction(txReceipt: TransactionReceipt, timestamp: string, quoteSizeThreshold: number, baseAsset: TrackedToken, quoteAsset: TrackedToken) {
  const baseAssetAddress: string = web3.utils.toChecksumAddress(baseAsset.address)
  const quoteAssetAddress: string = web3.utils.toChecksumAddress(quoteAsset.address)

  const sender: string = web3.utils.toChecksumAddress(txReceipt.from)

  // These are the ERC-20 transfers in the Ethereum transaction
  const internalTxns = txReceipt.logs

  // TODO: Consider handling fee-for-transfer operations as they can be up to 2% burn

  var inputAsset = null
  var rawInputTokenAmount: BigNumber = new BigNumber(0)
  var inputFromAddress: string
  var inputToAddress: string

  var outputAsset = null
  var rawOutputTokenAmount: BigNumber = new BigNumber(0)
  var outputFromAddress: string
  var outputToAddress: string

  var inputTokenResolved = null
  for (let internalTxnIndex = 0; internalTxnIndex < internalTxns.length; internalTxnIndex++) {
    const internalTxn = internalTxns[internalTxnIndex]
    const internalTxnTopics = internalTxn.topics

    if (internalTxnTopics[0] === transferSHA) {
      const tokenAddress = web3.utils.toChecksumAddress(internalTxn.address)

      var fromAddress: string = web3.eth.abi.decodeParameter('address', internalTxnTopics[1])['address']
      var toAddress: string = web3.eth.abi.decodeParameter('address', internalTxnTopics[2])['address']
      const rawAmount: number = web3.eth.abi.decodeParameter('uint256', internalTxn.data)['uint256']

      // Handle the case of adding and removing liquidity
      // Adding -> Both the input and output token are 'to' to the same address
      // Removing -> Both the input and output token are 'from' the same address

      if (inputTokenResolved === null) {
        if (tokenAddress === baseAssetAddress) {
          inputAsset = baseAsset
          outputAsset = quoteAsset
          inputTokenResolved = true
        } else if (tokenAddress === quoteAssetAddress) {
          inputAsset = quoteAsset
          outputAsset = baseAsset
          inputTokenResolved = true
        }

        if (inputTokenResolved) {
          rawInputTokenAmount = rawInputTokenAmount.plus(web3.utils.toBN(rawAmount).toString())
          inputFromAddress = fromAddress
          inputToAddress = toAddress
        }
      } else if (tokenAddress === outputAsset.address) {
        rawOutputTokenAmount = rawOutputTokenAmount.plus(web3.utils.toBN(rawAmount).toString())
        outputFromAddress = fromAddress
        outputToAddress = toAddress
        break
      }
    }
  }

  if (rawInputTokenAmount.isEqualTo(0) || rawOutputTokenAmount.isEqualTo(0)) {
    console.log('[WARNING] Skipping transaction due to errors while attempting to parse internal token txns.')
    // console.log(`Failed to aggregate swap size for one of the two pair assets. (TX = ${txReceipt.transactionHash})`)
    // console.log(internalTxns)
    return
  }

  var inputAmount: BigNumber
  var outputAmount: BigNumber
  var prettyInputAmount: number
  var prettyOutputAmount: number

  const previousLastPrice = lastPrice
  if (outputAsset.address === baseAssetAddress) {
    inputAmount = (rawInputTokenAmount.multipliedBy(10 ** (quoteAsset.decimals * -1)))
    outputAmount = (rawOutputTokenAmount.multipliedBy(10 ** (baseAsset.decimals * -1)))

    prettyInputAmount = parseFloat(prettifyAmount(inputAmount, quoteAsset.decimals))
    prettyOutputAmount = parseFloat(prettifyAmount(outputAmount, baseAsset.decimals))

    lastPrice = (inputAmount.dividedBy(outputAmount)).toNumber()
  } else {
    inputAmount = (rawInputTokenAmount.multipliedBy(10 ** (baseAsset.decimals * -1)))
    outputAmount = (rawOutputTokenAmount.multipliedBy(10 ** (quoteAsset.decimals * -1)))

    prettyInputAmount = parseFloat(prettifyAmount(inputAmount, baseAsset.decimals))
    prettyOutputAmount = parseFloat(prettifyAmount(outputAmount, quoteAsset.decimals))

    lastPrice = (outputAmount.dividedBy(inputAmount)).toNumber()
  }

  const inputAssetExceedsQuoteThreshold = ((inputAsset === quoteAsset) && (prettyInputAmount >= quoteSizeThreshold))
  const outputAssetExceedsQuoteThreshold = ((outputAsset === quoteAsset) && (prettyOutputAmount >= quoteSizeThreshold))

  const exceedsSizeThreshold = inputAssetExceedsQuoteThreshold || outputAssetExceedsQuoteThreshold
  if (quoteSizeThreshold > 0 && !exceedsSizeThreshold) {
    return
  }

  var priceDescription = `${lastPrice} ${quoteAsset.symbol}`
  if (previousLastPrice != null) {
    const priceMove: number = (((lastPrice - previousLastPrice) / previousLastPrice) * 100)
    priceDescription = `${priceDescription} / ${priceMove > 0 ? '+' : ''}${priceMove.toFixed(2)}%`
  }

  const txHash = txReceipt.transactionHash
  if (inputFromAddress === outputFromAddress) {
    console.log(`[${timestamp}] Liquidity added - ${prettyInputAmount} ${inputAsset.symbol} & ${prettyOutputAmount} ${outputAsset.symbol} (${priceDescription})`)
  } else if (inputToAddress === outputToAddress) {
    console.log(`[${timestamp}] Liquidity removed - ${prettyInputAmount} ${inputAsset.symbol} & ${prettyOutputAmount} ${outputAsset.symbol} (${priceDescription})`)
  } else {
    if (outputAsset.address === baseAssetAddress) {
      const baseDescription = `${prettyOutputAmount} ${outputAsset.symbol}`
      const quoteDescription = `${prettyInputAmount} ${inputAsset.symbol}`
      const swapDescription = `Bought ${baseDescription} for ${quoteDescription}`

      if (quoteSizeThreshold > 0 && exceedsSizeThreshold) {
        console.log(`\n[${timestamp}] ${swapDescription} (${priceDescription})`)
        console.log(`Transaction Information: https://etherscan.io/tx/${txHash}`)

        if (sender in whale_swaps) {
          whale_swaps[sender].totalSize += prettyInputAmount
          whale_swaps[sender].swaps.push([`[${timestamp}] ${swapDescription}`])
        } else {
          const swaps = [`[${timestamp}] ${swapDescription}`]
          const etherscan = `https://etherscan.io/address/${sender}`

          whale_swaps[sender] = {
            'address': sender,
            'etherscan': etherscan,
            'totalSize': prettyInputAmount,
            'swaps': swaps
          }
        }

        const whale_info = whale_swaps[sender]

        console.log('Trader Info:')
        console.log(`  Address: ${whale_info.address}`)
        console.log(`  Etherscan: ${whale_info.etherscan}`)
        console.log(`  Net Position: ${whale_info.totalSize} ${quoteAsset.symbol}`)
        console.log('  Swaps:')

        for (let i = 0; i < whale_info.swaps.length; i++) {
          console.log(`    - ${whale_info.swaps[i]}`)
        }
      } else {
        console.log(`[${timestamp}] Bought ${baseDescription} for ${quoteDescription} (${priceDescription})`)
      }
    } else {
      const baseDescription = `${prettyInputAmount} ${inputAsset.symbol}`
      const quoteDescription = `${prettyOutputAmount} ${outputAsset.symbol}`
      const swapDescription = `Sold ${baseDescription} for ${quoteDescription}`

      if (quoteSizeThreshold > 0 && exceedsSizeThreshold) {
        console.log(`\n[${timestamp}] ${swapDescription} (${priceDescription})`)
        console.log(`Transaction Information: https://etherscan.io/tx/${txHash}`)

        if (sender in whale_swaps) {
          whale_swaps[sender].totalSize -= prettyOutputAmount
          whale_swaps[sender].swaps.push([`[${timestamp}] ${swapDescription}`])
        } else {
          const swaps = [`[${timestamp}] ${swapDescription}`]
          const etherscan = `https://etherscan.io/address/${sender}`

          whale_swaps[sender] = {
            'address': sender,
            'etherscan': etherscan,
            'totalSize': prettyOutputAmount * -1,
            'swaps': swaps
          }
        }

        const whale_info = whale_swaps[sender]

        console.log('Trader Info:')
        console.log(`  Address: ${whale_info.address}`)
        console.log(`  Etherscan: ${whale_info.etherscan}`)
        console.log(`  Net Position: ${whale_info.totalSize} ${quoteAsset.symbol}`)
        console.log('  Swaps:')

        for (let i = 0; i < whale_info.swaps.length; i++) {
          console.log(`    - ${whale_info.swaps[i]}`)
        }
      } else {
        console.log(`[${timestamp}] ${swapDescription} (${priceDescription})`)
      }
    }
  }
}

/**
 * TODO - Documentation
 */
function cliArgumentsAreValid() {
  if (argv.base === undefined) {
    console.log('Base asset(s) must be provided to subscribe to token pair information.')
    return false
  }

  if (argv.quote === undefined) {
    console.log('A quote asset must be provided to subscribe to token pair information.')
    return false
  }

  if (argv.threshold != undefined) {
    const threshold: number = argv.threshold

    if (threshold === NaN) {
      console.log(`Expected a floating point value for 'threshold' but received ${argv.threshold}`)
      return false
    }

    if (threshold < -1) {
      console.log('The provided threshold must be a positive value.')
      return false
    }
  }

  return true
}

/**
 * TODO - Documentation
 */
async function main() {
  if (!cliArgumentsAreValid) {
    return 1
  }

  const baseAssets: string[] = argv.base.split(',').map(asset => asset.trim())
  const quoteAsset: string = argv.quote
  const threshold: number = argv.threshold != undefined ? argv.threshold : 0.0

  console.log('\n\nWARNING: It is highly suggested to verify any transactions logged by using the Etherscan link above before acting on that information.\n')
  if (threshold > 0) {
    console.log(`Order size threshold set to ${threshold} ${quoteAsset}`)
  }
  console.log("Subscribing to pairs...")
  console.log('----------------------------------------\n')

  const quoteToken = await getToken(quoteAsset)
  console.log(quoteToken)

  // baseAssets.forEach(async (baseAsset) => {
  //   const baseToken = await getToken(baseAsset)
  //   const pairInfo = await getUniswapPairInfo(baseToken, quoteToken)
  //   await subscribe(pairInfo.subscribed.base, pairInfo.subscribed.quote, pairInfo.uniswap.address, threshold)
  // })

  return 0
}

exit(main())