import { AbiItem, AbiType } from 'web3-utils'

/**
 * Token registry used to get the contract address for a given symbol
 */
export const symbolToAddressMap: { [key: string]: string } = {
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
    'XIOT': '0x31024a4c3e9aeeb256b825790f5cb7ac645e7cd5',
    'YFI': '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'
}

/**
* Minimum ABI to get the fields we care about from the ERC-20 tokens
*/
export const erc20_abi: AbiItem[] = [
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