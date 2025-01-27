import ArweaveClient from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import axios from "axios";
import BigNumber from "bignumber.js";
import { IStorageProvider } from "../types";

export class Arweave implements IStorageProvider {
  public name = "Arweave";
  public decimals = 12;

  private wallet!: JWKInterface;
  private arweaveClient = new ArweaveClient({
    host: "arweave.net",
    protocol: "https",
  });

  init(wallet: string) {
    // TODO: built in wallet format validation?
    this.wallet = JSON.parse(wallet);

    return this;
  }

  async getBalance() {
    return await this.arweaveClient.wallets.getBalance(
      await this.arweaveClient.wallets.getAddress(this.wallet)
    );
  }

  async saveBundle(bundle: Buffer, tags: [string, string][]) {
    const transaction = await this.arweaveClient.createTransaction({
      data: bundle,
    });

    for (let tag of tags) {
      transaction.addTag(...tag);
    }

    await this.arweaveClient.transactions.sign(transaction, this.wallet);

    const balance = await this.getBalance();

    if (+transaction.reward > +balance) {
      throw Error(
        `Not enough funds in Arweave wallet. Found = ${balance} required = ${transaction.reward}`
      );
    }

    await this.arweaveClient.transactions.post(transaction);

    return transaction.id;
  }

  async retrieveBundle(storageId: string, timeout: number) {
    const { data: bundle } = await axios.get(
      `https://arweave.net/${storageId}`,
      { responseType: "arraybuffer", timeout }
    );

    return bundle;
  }
}
