## LSK Migration Script Example

This repository includes an example script showing how to claim the token without using the Lisk Portal.

### How to Run This Example

1. Add the private key of the Ethereum account that holds some ETH balance on Lisk to `eth_sender_private_key.txt`. This will be used to send the token claim transaction on Lisk.
2. Add the Ethereum address where you want to receive the LSK token to `target_address.txt`.
3. Add the private keys of the Lisk L1 network corresponding to the address that holds the balance on the Lisk L1 network to `migrating_private_keys.txt`. This file can accept multiple lines.
4. Run `node index.mjs`