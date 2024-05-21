import fs from 'fs';
import {address, ed} from '@liskhq/lisk-cryptography';
import { signDetached } from '@liskhq/lisk-cryptography/dist-node/nacl/index.js';

import { encodeAbiParameters, parseAbiParameters, keccak256, createWalletClient, http, publicActions, parseEther } from 'viem';
import * as chains from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import { callRPC, callClaimContract } from './utils.mjs';
import networkInfoJSON from './network_info.json' assert { type: "json" };

async function migrateToken(network, ethWallet, accountHandler, targetEthAddress) {
    console.log(`Migrating ${accountHandler.address} to ${targetEthAddress}...`);

    const eligibility = await callRPC(network.claimAPIURL, 'checkEligibility', { lskAddress: accountHandler.address });
    if (!eligibility.account) {
        return;
    }
    if (eligibility.multisigAccounts.length !== 0) {
        console.log(`${accountHandler.address} is a member of multisig accounts. However, multisig accounts migration with this tool is not supported.`);
    }

    console.log(`Eligible amount: ${eligibility.account.balanceBeddows}`);
    const signingHash = eligibility.account.hash;
    console.log(`Signing hash: ${signingHash}`);

    const portalMessage = keccak256(
        encodeAbiParameters(parseAbiParameters('bytes32, address'), [signingHash, targetEthAddress]),
    ).concat('000000000000000000');

    const signature = accountHandler.sign(portalMessage);
    console.log(`Signed message ${portalMessage}: ${signature}`);

    await callClaimContract(ethWallet, network.contractAddress, "claimRegularAccount", [eligibility.account.proof, `0x${accountHandler.publicKey}`, eligibility.account.balanceBeddows, targetEthAddress, [`0x${signature.slice(0, 64)}`, `0x${signature.slice(64)}`]]);
}

class LiskAccountHandler {
    constructor(privateKey) {
        this._privateKey = privateKey;
    }

    get publicKey() {
        return ed.getPublicKeyFromPrivateKey(Buffer.from(this._privateKey, 'hex')).toString('hex');
    }

    get address() {
        const publicKey = ed.getPublicKeyFromPrivateKey(Buffer.from(this._privateKey, 'hex'));
        return address.getLisk32AddressFromPublicKey(publicKey);
    }

    // Note: message assumes it's prepended with "0x"
    sign(message) {
        return signDetached(Buffer.from(message.slice(2), 'hex'), Buffer.from(this._privateKey, 'hex')).toString('hex');
    }
}

(async function() {
    const network = process.env.NETWORK ?? 'testnet';
    const selectedNetwork = networkInfoJSON[network];

    const privateKeys = fs.readFileSync('./migrating_private_keys.txt', 'utf8').split('\n').filter(String);
    const ethAddress = fs.readFileSync('./target_address.txt', 'utf8');
    const senderPrivateKey = fs.readFileSync('./eth_sender_private_key.txt', 'utf8');

    const senderAccount = privateKeyToAccount(senderPrivateKey);
    const walletClient = createWalletClient({
        chain: chains[selectedNetwork.network],
        account: senderAccount,
        transport: http(network.liskAPIURL),
    }).extend(publicActions);

    // sign message
    for (const privateKey of privateKeys) {
        const accountHandler = new LiskAccountHandler(privateKey);
        await migrateToken(selectedNetwork, walletClient, accountHandler, ethAddress);
    }
})()