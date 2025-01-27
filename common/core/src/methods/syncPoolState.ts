import { Node } from "..";
import { callWithBackoffStrategy } from "../utils";

export async function syncPoolState(this: Node): Promise<void> {
  await callWithBackoffStrategy(
    async () => {
      const { pool } = await this.lcd.kyve.query.v1beta1.pool({
        id: this.poolId.toString(),
      });
      this.pool = pool!;

      this.prom.query_pool_successful.inc();

      try {
        this.poolConfig = JSON.parse(this.pool.data!.config);
      } catch (error) {
        this.logger.debug(
          `Failed to parse the pool config: ${this.pool.data?.config}`
        );
        this.poolConfig = {};
      }
    },
    { limitTimeout: "5m", increaseBy: "10s" },
    (error: any, ctx) => {
      this.logger.info(
        `Failed to sync pool state. Retrying in ${(
          ctx.nextTimeoutInMs / 1000
        ).toFixed(2)}s ...`
      );
      this.logger.debug(error?.response ?? error);
      this.prom.query_pool_failed.inc();
    }
  );
}
