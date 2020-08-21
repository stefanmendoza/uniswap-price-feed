var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.WebsocketProvider('wss://mainnet.infura.io/ws/v3/' + process.env.UNISWAP_FEED_INFURA_PROJECT_ID));

const BigNumber = require('bignumber.js');
const Uniswap = require('@uniswap/sdk');

const transfer_sha = web3.utils.sha3('Transfer(address,address,uint256)')
var lastPrice = null

// ========= NOTICE =========
// Request-Rate Exceeded  (this message will not be repeated)

// The default API keys for each service are provided as a highly-throttled,
// community resource for low-traffic projects and early prototyping.

// While your application will continue to function, we highly recommended
// signing up for your own API keys to improve performance, increase your
// request rate/limit and enable other perks, such as metrics and advanced APIs.

// For more details: https://docs.ethers.io/api-keys/
// ==========================
// const network = "homestead";
// const provider = ethers.getDefaultProvider(network, { infura: YOUR_INFURA_PROJECT_ID });

// Token registry used to get the contract address for a givne symbol
var symbol_to_address = {
  'ETH': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  'WETH': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',

  'USDC': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  'USDT': '0xdac17f958d2ee523a2206206994597c13d831ec7',

  'ANT': '0x960b236a07cf122663c4303350609a66a7b288c0',
  'BZRX': '0x56d811088235f11c8920698a204a5010a788f4b3',
  'CREAM': '0x2ba592f78db6436527729929aaf6c908497cb200',
  'CRV': '0xd533a949740bb3306d119cc777fa900ba034cd52',
  'DIA': '0x84ca8bc7997272c7cfb4d0cd3d55cd942b3c9419',
  'DMG': '0xed91879919b71bb6905f23af0a68d231ecf87b14',
  'FLOW': '0xc6e64729931f60d2c8bc70a27d66d9e0c28d1bf9',
  'KEN': '0x6a7ef4998eb9d0f706238756949f311a59e05745',
  'LAYER': '0x0ff6ffcfda92c53f615a4a75d982f399c989366b',
  'LID': '0x0417912b3a7af768051765040a55bb0925d4ddcf',
  'MTA': '0xa3bed4e1c75d00fa6f4e5e6922db7261b5e9acd2',
  'OM': '0x2baecdf43734f22fd5c152db08e3c27233f0c7d2',
  'REN': '0x408e41876cccdc0f92210600ef50372656052a38',
  'RSR': '0x8762db106b2c2a0bccb3a80d1ed41273552616e8',
  'SNX': '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  'TOB': '0x7777770f8a6632ff043c8833310e245eba9209e6',
  'TRADE': '0x6f87d756daf0503d08eb8993686c7fc01dc44fb1',
  'XAMP': '0xf911a7ec46a2c6fa49193212fe4a2a9b95851c27',
  'YFI': '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'
}

const blockTimestamps = {}
const processedTransactions = []
const whale_swaps = {}

// Minimum ABI to get the fields we care about from the ERC-20 tokens
var erc20_abi = [
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "payable": false,
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "payable": false,
    "type": "function"
  }
]

async function getTokenDecimals(contract) {
  try {
    return await contract.methods.decimals().call()
  } catch (error) {
    console.log("error" + error);
  }
}

async function getTokenName(contract) {
  try {
    return await contract.methods.name().call()
  } catch (error) {
    console.log("error" + error);
  }
}

async function getTokenSymbol(contract) {
  try {
    return await contract.methods.symbol().call()
  } catch (error) {
    console.log("error" + error);
  }
}

function prettifyAmount(amount, decimals) {
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

async function handleSwap(txReceipt, timestamp, quoteSizeThreshold, baseAsset, quoteAsset) {
  let baseAssetAddress = web3.utils.toChecksumAddress(baseAsset.address)
  let quoteAssetAddress = web3.utils.toChecksumAddress(quoteAsset.address)

  let sender = web3.utils.toChecksumAddress(txReceipt.from)

  // These are the ERC-20 transfers in the Ethereum transaction
  let internalTxns = txReceipt.logs

  // TODO: Consider handling fee-for-transfer operations as they can be up to 2% burn

  var inputAsset = null
  var rawInputTokenAmount = new BigNumber(0)
  var inputFromAddress = null
  var inputToAddress = null

  var outputAsset = null
  var rawOutputTokenAmount = new BigNumber(0)
  var outputFromAddress = null
  var outputToAddress = null

  var inputTokenResolved = null
  for (let internalTxnIndex = 0; internalTxnIndex < internalTxns.length; internalTxnIndex++) {
    let internalTxn = internalTxns[internalTxnIndex]
    let internalTxnTopics = internalTxn.topics

    if (internalTxnTopics[0] === transfer_sha) {
      let tokenAddress = web3.utils.toChecksumAddress(internalTxn.address)

      var fromAddress = web3.eth.abi.decodeParameter('address', internalTxnTopics[1])
      var toAddress = web3.eth.abi.decodeParameter('address', internalTxnTopics[2])
      let rawAmount = web3.eth.abi.decodeParameter('uint256', internalTxn.data)

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
          rawInputTokenAmount = rawInputTokenAmount.plus(web3.utils.toBN(rawAmount))
          inputFromAddress = fromAddress
          inputToAddress = toAddress
        }
      } else if (tokenAddress === outputAsset.address) {
        rawOutputTokenAmount = rawOutputTokenAmount.plus(web3.utils.toBN(rawAmount))
        outputFromAddress = fromAddress
        outputToAddress = toAddress
        break
      }
    }
  }

  if (rawInputTokenAmount === 0 || rawOutputTokenAmount == 0) {
    console.log('[WARNING] Skipping transaction due to errors while attempting to parse internal token txns.')
    // console.log(`Failed to aggregate swap size for one of the two pair assets. (TX = ${txReceipt.transactionHash})`)
    // console.log(internalTxns)
    return
  }

  var inputAmount = null
  var outputAmount = null
  let prettyInputAmount = 0
  let prettyOutputAmount = 0

  if (outputAsset.address === baseAssetAddress) {
    inputAmount = (rawInputTokenAmount.multipliedBy(10 ** (quoteAsset.decimals * -1)))
    outputAmount = (rawOutputTokenAmount.multipliedBy(10 ** (baseAsset.decimals * -1)))

    prettyInputAmount = parseFloat(prettifyAmount(inputAmount, quoteAsset.decimals))
    prettyOutputAmount = parseFloat(prettifyAmount(outputAmount, baseAsset.decimals))

    previousLastPrice = lastPrice
    lastPrice = (inputAmount / outputAmount).toFixed(quoteAsset.decimals / 2)
  } else {
    inputAmount = (rawInputTokenAmount.multipliedBy(10 ** (baseAsset.decimals * -1)))
    outputAmount = (rawOutputTokenAmount.multipliedBy(10 ** (quoteAsset.decimals * -1)))

    prettyInputAmount = parseFloat(prettifyAmount(inputAmount, baseAsset.decimals))
    prettyOutputAmount = parseFloat(prettifyAmount(outputAmount, quoteAsset.decimals))

    previousLastPrice = lastPrice
    lastPrice = (outputAmount / inputAmount).toFixed(quoteAsset.decimals / 2)
  }

  // console.log(`\nInput: ${prettyInputAmount} ${inputAsset.symbol}`)
  // console.log(`Output: ${prettyOutputAmount} ${outputAsset.symbol}`)

  // console.log(`Quote Asset: ${quoteAsset.symbol}`)
  // console.log(`Quote Size Threshold: ${quoteSizeThreshold}`)
  // console.log(`Quote Size Threshold (type): ${typeof quoteSizeThreshold}`)

  // console.log(`Input Asset: ${inputAsset.symbol}`)
  // console.log(`Input Amount: ${prettyInputAmount}`)
  // console.log(`Input Amount (type): ${typeof prettyInputAmount}`)

  // console.log(`Output Asset: ${outputAsset.symbol}`)
  // console.log(`Output Amount: ${prettyOutputAmount}`)
  // console.log(`Output Amount (type): ${typeof prettyOutputAmount}`)

  let inputAssetExceedsQuoteThreshold = ((inputAsset === quoteAsset) && (prettyInputAmount >= quoteSizeThreshold))
  let outputAssetExceedsQuoteThreshold = ((outputAsset === quoteAsset) && (prettyOutputAmount >= quoteSizeThreshold))

  // console.log(`inputAssetExceedsQuoteThreshold: ${inputAssetExceedsQuoteThreshold}`)
  // console.log(`outputAssetExceedsQuoteThreshold: ${outputAssetExceedsQuoteThreshold}`)

  let exceedsSizeThreshold = inputAssetExceedsQuoteThreshold || outputAssetExceedsQuoteThreshold

  if (quoteSizeThreshold > 0 && !exceedsSizeThreshold) {
    return
  }

  var priceDescription = `${lastPrice} ${quoteAsset.symbol}`
  if (previousLastPrice != null) {
    priceMove = (((lastPrice - previousLastPrice) / previousLastPrice) * 100).toFixed(2)
    priceDescription = `${priceDescription} / ${priceMove > 0 ? '+' : ''}${priceMove}%`
  }

  let txHash = txReceipt.transactionHash
  if (inputFromAddress === outputFromAddress) {
    console.log(`[${timestamp}] Liquidity added - ${prettyInputAmount} ${inputAsset.symbol} & ${prettyOutputAmount} ${outputAsset.symbol} (${priceDescription})`)
  } else if (inputToAddress === outputToAddress) {
    console.log(`[${timestamp}] Liquidity removed - ${prettyInputAmount} ${inputAsset.symbol} & ${prettyOutputAmount} ${outputAsset.symbol} (${priceDescription})`)
  } else {
    if (outputAsset.address === baseAssetAddress) {
      let baseDescription = `${prettyOutputAmount} ${outputAsset.symbol}`
      let quoteDescription = `${prettyInputAmount} ${inputAsset.symbol}`
      let swapDescription = `Bought ${baseDescription} for ${quoteDescription}`

      if (quoteSizeThreshold > 0 && exceedsSizeThreshold) {
        console.log(`\n[${timestamp}] ${swapDescription} (${priceDescription})`)
        console.log(`Transaction Information: https://etherscan.io/tx/${txHash}`)

        if (sender in whale_swaps) {
          whale_swaps[sender].totalSize += prettyInputAmount
          whale_swaps[sender].swaps.push([`[${timestamp}] ${swapDescription}`])
        } else {
          swaps = [`[${timestamp}] ${swapDescription}`]
          etherscan = `https://etherscan.io/address/${sender}`

          whale_swaps[sender] = {
            'address': sender,
            'etherscan': etherscan,
            'totalSize': prettyInputAmount,
            'swaps': swaps
          }
        }

        whale_info = whale_swaps[sender]

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
      let baseDescription = `${prettyInputAmount} ${inputAsset.symbol}`
      let quoteDescription = `${prettyOutputAmount} ${outputAsset.symbol}`
      let swapDescription = `Sold ${baseDescription} for ${quoteDescription}`

      if (quoteSizeThreshold > 0 && exceedsSizeThreshold) {
        console.log(`\n[${timestamp}] ${swapDescription} (${priceDescription})`)
        console.log(`Transaction Information: https://etherscan.io/tx/${txHash}`)

        if (sender in whale_swaps) {
          whale_swaps[sender].totalSize -= prettyOutputAmount
          whale_swaps[sender].swaps.push([`[${timestamp}] ${swapDescription}`])
        } else {
          swaps = [`[${timestamp}] ${swapDescription}`]
          etherscan = `https://etherscan.io/address/${sender}`

          whale_swaps[sender] = {
            'address': sender,
            'etherscan': etherscan,
            'totalSize': prettyOutputAmount * -1,
            'swaps': swaps
          }
        }

        whale_info = whale_swaps[sender]

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBlock(blockNumber, retries) {
  let block = await web3.eth.getBlock(blockNumber)

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


async function main() {
  var cli_args = process.argv.slice(2)

  var tokenASymbol = cli_args[0]
  var tokenBSymbol = (cli_args.length > 1 && cli_args.length < 4) ? cli_args[1] : 'ETH'
  var quoteSizeThreshold = cli_args.length == 3 ? parseFloat(cli_args[2]) : parseFloat(0)

  // Creation of a Uniswap Token object requires a checksummed address

  console.log("Retrieving contract information...")

  var tokenAAddress = symbol_to_address[tokenASymbol]
  if (!web3.utils.checkAddressChecksum(tokenAAddress)) {
    tokenAAddress = web3.utils.toChecksumAddress(tokenAAddress)
  }

  var tokenBAddress = symbol_to_address[tokenBSymbol]
  if (!web3.utils.checkAddressChecksum(tokenBAddress)) {
    tokenBAddress = web3.utils.toChecksumAddress(tokenBAddress)
  }

  const tokenAContract = new web3.eth.Contract(erc20_abi, tokenAAddress);
  const tokenBContract = new web3.eth.Contract(erc20_abi, tokenBAddress);

  console.log("Contract information retrieved.")

  // Get ERC-20 attributes from the two tokens' contracts

  const tokenADecimals = await getTokenDecimals(tokenAContract)
  const baseAsset = new Uniswap.Token(Uniswap.ChainId.MAINNET, tokenAAddress, tokenADecimals, tokenASymbol)

  const tokenBDecimals = await getTokenDecimals(tokenBContract)
  const quoteAsset = new Uniswap.Token(Uniswap.ChainId.MAINNET, tokenBAddress, tokenBDecimals, tokenBSymbol)

  console.log(`\nBase Asset: ${baseAsset.symbol}`)
  console.log(`  Decimals: ${baseAsset.decimals}`)
  console.log(`  Address: ${baseAsset.address}`)
  console.log(`Quote Asset: ${quoteAsset.symbol}`)
  console.log(`  Decimals: ${quoteAsset.decimals}`)
  console.log(`  Address: ${quoteAsset.address}`)

  console.log("\nRetrieving Uniswap pair information...")

  const pair = await Uniswap.Fetcher.fetchPairData(baseAsset, quoteAsset)
  const pairAddress = Uniswap.Pair.getAddress(baseAsset, quoteAsset)

  console.log("Uniswap pair information retrieved.")

  var pairBaseSymbol = null
  var pairQuoteSymbol = null
  if (pair.token0.address === baseAsset.address) {
    pairBaseSymbol = baseAsset.symbol
    pairQuoteSymbol = quoteAsset.symbol
  } else {
    pairBaseSymbol = quoteAsset.symbol
    pairQuoteSymbol = baseAsset.symbol
  }

  console.log(`\nPair: ${pairBaseSymbol}-${pairQuoteSymbol}`)
  console.log(`  Address: ${pairAddress}`)
  console.log(`  Raw Data Feed: https://etherscan.io/address/${pairAddress}/#tokentxns`)


  console.log('\nWARNING: It is suggested to verify any transactions logged by using the Etherscan link above before acting on that information.\n')

  if (quoteSizeThreshold > 0) {
    console.log(`Order size threshold set: ${quoteSizeThreshold} ${quoteAsset.symbol}`)
  }

  console.log("Beginning live feed of swaps...")
  console.log('\n----------------------------------------\n')

  // // Setup Infura filters to get new blocks (for timestamps) and pair address txns (i.e. Swaps)

  web3.eth.subscribe('logs', {
    'address': [
      pairAddress
    ],
  }, function (error, result) {
    if (error) {
      console.log("Error: " + error)
    }
  })
    .on("data", async function (log) {
      let txHash = log.transactionHash
      let blockNumber = log.blockNumber


      if (!(blockNumber in blockTimestamps)) {
        let block = await getBlock(log.blockNumber, 5)
        let timestamp = block.timestamp

        let rawUtcDate = new Date(block.timestamp * 1000).toISOString()
        blockTimestamps[blockNumber] = `${rawUtcDate.slice(0, 10)} ${rawUtcDate.split('T')[1].slice(0, 8)}`
      }

      web3.eth.getTransactionReceipt(txHash).then(receipt => {
        if (receipt != null) {
          if (!(processedTransactions.includes(txHash))) {
            handleSwap(receipt, blockTimestamps[blockNumber], quoteSizeThreshold, baseAsset, quoteAsset)
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

  return;
}

main()
