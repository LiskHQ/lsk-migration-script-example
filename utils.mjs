import { parseEther } from 'viem';
import abi from './abi.json' assert { type: "json" };

export async function callRPC(url, method, params) {
    const resp = await fetch(url, {
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

export async function callClaimContract(walletClient, contractAddress, functionName, args) {
    const { request } = await walletClient.simulateContract({
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