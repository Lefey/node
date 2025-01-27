import { Node } from "..";
import { sleep, standardizeJSON, sha256, bytesToBundle } from "../utils";
import { ERROR_IDLE_TIME, VOTE } from "../utils/constants";
import { DataItem } from "../types";
import BigNumber from "bignumber.js";

export async function validateBundleProposal(
  this: Node,
  createdAt: number
): Promise<void> {
  this.logger.info(
    `Validating bundle "${this.pool.bundle_proposal!.storage_id}"`
  );

  let hasVotedAbstain = this.pool.bundle_proposal?.voters_abstain.includes(
    this.staker
  );

  let uploadedBundle: DataItem[] = [];
  let uploadedBundleHash: string = "";
  let proposedBundleCompressed: Buffer;

  let validationBundle: DataItem[] = [];

  while (true) {
    await this.syncPoolState();

    const unixNow = new BigNumber(Date.now());
    const unixIntervalEnd = new BigNumber(this.pool.bundle_proposal!.created_at)
      .plus(this.pool.data!.upload_interval)
      .multipliedBy(1000);

    if (+this.pool.bundle_proposal!.created_at > createdAt) {
      // check if new proposal is available in the meantime
      return;
    } else if (this.shouldIdle()) {
      // check if pool got paused in the meantime
      return;
    } else if (
      this.pool.bundle_proposal!.next_uploader === this.staker &&
      unixNow.gte(unixIntervalEnd)
    ) {
      // check if validator needs to upload
      return;
    }

    // try to download bundle from arweave
    if (!proposedBundleCompressed!) {
      let downloadTimeout = Math.max(
        0,
        parseInt(this.pool.data?.upload_interval ?? "0") - 20
      );

      this.logger.debug(
        `Attempting to download bundle from StorageProvider:${this.storageProvider.name} with a download timeout of ${downloadTimeout}s`
      );

      try {
        proposedBundleCompressed = await this.storageProvider.retrieveBundle(
          this.pool.bundle_proposal!.storage_id,
          downloadTimeout * 1000
        );
        this.prom.storage_provider_retrieve_successful.inc();
      } catch (error) {
        this.logger.warn(
          ` Failed to retrieve bundle from StorageProvider:${this.storageProvider.name}. Retrying in 10s ...\n`
        );
        this.prom.storage_provider_retrieve_failed.inc();

        if (!hasVotedAbstain) {
          await this.voteBundleProposal(
            this.pool.bundle_proposal!.storage_id,
            VOTE.ABSTAIN
          );
          hasVotedAbstain = true;
        }

        await sleep(ERROR_IDLE_TIME);
        continue;
      }

      if (proposedBundleCompressed!) {
        this.logger.info(
          `Successfully downloaded bundle from StorageProvider:${this.storageProvider.name}`
        );

        try {
          uploadedBundleHash = sha256(proposedBundleCompressed);

          const uploadedBundleBytes = await this.compression.decompress(
            proposedBundleCompressed
          );

          uploadedBundle = bytesToBundle(uploadedBundleBytes);

          this.logger.info(
            `Successfully decompressed bundle with compression type Compression:${this.compression.name}`
          );
        } catch (error) {
          this.logger.info(
            `Could not decompress bundle with compression type Compression:${this.compression.name}`
          );
        }
      } else {
        this.logger.info(
          `Could not download bundle from StorageProvider:${this.storageProvider.name}. Retrying in 10s ...`
        );

        if (!hasVotedAbstain) {
          await this.voteBundleProposal(
            this.pool.bundle_proposal!.storage_id,
            VOTE.ABSTAIN
          );
          hasVotedAbstain = true;
        }

        await sleep(ERROR_IDLE_TIME);
        continue;
      }
    }

    // try to load local bundle
    const currentHeight = +this.pool.data!.current_height;
    const toHeight = +this.pool.bundle_proposal!.to_height || currentHeight;

    this.logger.debug(
      `Attempting to load local bundle from ${currentHeight} to ${toHeight} ...`
    );

    const { bundle } = await this.loadBundle(currentHeight, toHeight);

    // check if bundle length is equal to request bundle
    if (bundle.length === toHeight - currentHeight) {
      validationBundle = bundle;

      this.logger.info(
        `Successfully loaded local bundle from ${currentHeight} to ${toHeight}\n`
      );

      break;
    } else {
      this.logger.info(
        `Could not load local bundle from ${currentHeight} to ${toHeight}. Retrying in 10s ...`
      );

      if (!hasVotedAbstain) {
        await this.voteBundleProposal(
          this.pool.bundle_proposal!.storage_id,
          VOTE.ABSTAIN
        );
        hasVotedAbstain = true;
      }

      await sleep(ERROR_IDLE_TIME);
      continue;
    }
  }

  try {
    const proposedBundleHash = this.pool.bundle_proposal!.bundle_hash;

    const uploadedByteSize = proposedBundleCompressed.byteLength;
    const proposedByteSize = +this.pool.bundle_proposal!.byte_size;

    const uploadedKey = uploadedBundle!.at(-1)?.key ?? "";
    const proposedKey = this.pool.bundle_proposal!.to_key;

    const uploadedValue = await this.runtime.formatValue(
      uploadedBundle!.at(-1)?.value ?? ""
    );
    const proposedValue = this.pool.bundle_proposal!.to_value;

    this.logger.debug(`Validating bundle proposal by byte size and hash`);
    this.logger.debug(
      `Uploaded:     ${uploadedByteSize} ${uploadedBundleHash}`
    );
    this.logger.debug(
      `Proposed:     ${proposedByteSize} ${proposedBundleHash}\n`
    );

    this.logger.debug(`Validating bundle proposal by key and value`);
    this.logger.debug(`Uploaded:     ${uploadedKey} ${uploadedValue}`);
    this.logger.debug(`Proposed:     ${proposedKey} ${proposedValue}\n`);

    let valid = false;

    if (
      uploadedBundleHash === proposedBundleHash &&
      uploadedByteSize === proposedByteSize &&
      uploadedKey === proposedKey &&
      uploadedValue === proposedValue
    ) {
      valid = true;
    }

    if (valid) {
      valid = await this.runtime.validate(
        this,
        standardizeJSON(uploadedBundle),
        standardizeJSON(validationBundle)
      );
    }

    if (valid) {
      await this.voteBundleProposal(
        this.pool.bundle_proposal!.storage_id,
        VOTE.VALID
      );
    } else {
      await this.voteBundleProposal(
        this.pool.bundle_proposal!.storage_id,
        VOTE.INVALID
      );
    }

    this.prom.bundles_amount.setToCurrentTime();
    this.prom.bundles_data_items.set(uploadedBundle.length);
    this.prom.bundles_byte_size.set(+proposedByteSize);
  } catch (error) {
    this.logger.warn(` Failed to validate bundle`);
    this.logger.debug(error);

    if (!hasVotedAbstain) {
      await this.voteBundleProposal(
        this.pool.bundle_proposal!.storage_id,
        VOTE.ABSTAIN
      );
    }
  }
}
