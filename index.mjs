import fs from 'fs';
import {address, ed} from '@liskhq/lisk-cryptography';
import { signDetached } from '@liskhq/lisk-cryptography/dist-node/nacl/index.js';

import { encodeAbiParameters, parseAbiParameters, keccak256, createWalletClient, http, publicActions, parseEther } from 'viem';
import * as chains from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import target from './target.json' assert { type: "json" };
import abi from './abi.json' assert { type: "json" };

const { claimAPIURL, liskAPIURL, contractAddress } = target;

async function callRPC(method, params) {
    const resp = await fetch(claimAPIURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: '2',
            method,
            params,
        }),
    });
    const respBody = await resp.json();

    if (respBody.error) {
        throw new Error(respBody.error.message);
    }
    return respBody.result;
}

async function callClaimContract(walletClient, functionName, args) {
    const { request, result } = await walletClient.simulateContract({
        address: contractAddress,
        abi,
        functionName,
        value: parseEther('0'),
        args,
    });
    const hash = await walletClient.writeContract(request);

    console.log(`Sent transaction: ${hash}. Waiting for confirmation...`);

    const receipt = await walletClient.waitForTransactionReceipt(
        { hash }
    );
    console.log(receipt.status === 'success' ? 'Transaction confirmed' : 'Transaction failed');
}

async function migrateToken(ethWallet, lskPrivateKey, targetEthAddress) {
    const publicKey = ed.getPublicKeyFromPrivateKey(Buffer.from(lskPrivateKey, 'hex')).toString('hex');
    const lskAddress = address.getLisk32AddressFromPublicKey(Buffer.from(publicKey, 'hex'));
    console.log(`Migrating ${lskAddress} to ${targetEthAddress}...`);

    const eligibility = await callRPC('checkEligibility', { lskAddress });
    if (!eligibility.account) {
        return;
    }
    if (eligibility.multisigAccounts.length !== 0) {
        console.log(`${lskAddress} is a member of multisig accounts. However, multisig accounts migration with this tool is not supported.`);
    }

    console.log(`Eligible amount: ${eligibility.account.balanceBeddows}`);
    const signingHash = eligibility.account.hash;
    console.log(`Signing hash: ${signingHash}`);

    const portalMessage = keccak256(
        encodeAbiParameters(parseAbiParameters('bytes32, address'), [signingHash, targetEthAddress]),
    ).concat('000000000000000000');


    const signature = signDetached(Buffer.from(portalMessage.slice(2), 'hex'), Buffer.from(lskPrivateKey, 'hex')).toString('hex');
    console.log(`Signed message ${portalMessage}: ${signature}`);

    await callClaimContract(ethWallet, "claimRegularAccount", [eligibility.account.proof, `0x${publicKey}`, eligibility.account.balanceBeddows, targetEthAddress, [`0x${signature.slice(0, 64)}`, `0x${signature.slice(64)}`]]);
}

(async function() {
    const privateKeys = fs.readFileSync('./migrating_private_keys.txt', 'utf8').split('\n').filter(String);
    const ethAddress = fs.readFileSync('./target_address.txt', 'utf8');
    const senderPrivateKey = fs.readFileSync('./eth_sender_private_key.txt', 'utf8');

    const senderAccount = privateKeyToAccount(senderPrivateKey);
    const walletClient = createWalletClient({
        chain: chains[target.network],
        account: senderAccount,
        transport: http(liskAPIURL),
    }).extend(publicActions);

    // sign message
    for (const privateKey of privateKeys) {
        await migrateToken(walletClient, privateKey, ethAddress);
    }
})()