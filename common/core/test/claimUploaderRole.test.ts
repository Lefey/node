import { Logger } from "tslog";
import { Pool } from "../../proto/dist/proto/kyve/registry/v1beta1/registry";
import { Node } from "../src/index";
import { TestRuntime } from "./mocks/integration";
import { claimUploaderRole } from "../src/methods/claimUploaderRole";

describe("src/methods/claimUploaderRole.ts", () => {
  let core: Node;

  let loggerInfo: jest.Mock;
  let loggerDebug: jest.Mock;
  let loggerWarn: jest.Mock;
  let loggerError: jest.Mock;

  let processExit: jest.Mock<never, never>;

  beforeEach(() => {
    core = new Node();

    core.addRuntime(new TestRuntime());

    // mock process.exit
    processExit = jest.fn<never, never>();
    process.exit = processExit;

    // mock logger
    core.logger = new Logger();

    loggerInfo = jest.fn();
    loggerDebug = jest.fn();
    loggerWarn = jest.fn();
    loggerError = jest.fn();

    core.logger.info = loggerInfo;
    core.logger.debug = loggerDebug;
    core.logger.warn = loggerWarn;
    core.logger.error = loggerError;

    core["poolId"] = 0;
  });

  test("claimUploaderRole: claim when next uploader is already set", async () => {
    // ARRANGE
    const executeMock = jest.fn().mockResolvedValue({
      code: 0,
    });

    const claimUploaderRoleMock = jest.fn().mockResolvedValue({
      txHash: "test_hash",
      execute: executeMock,
    });

    core.client = {
      kyve: {
        v1beta1: {
          base: {
            claimUploaderRole: claimUploaderRoleMock,
          },
        },
      },
    } as any;

    core.pool = {
      bundle_proposal: {
        next_uploader: "test_next_uploader",
      },
    } as Pool;

    // ACT
    const res = await claimUploaderRole.call(core);

    // ASSERT
    expect(claimUploaderRoleMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();

    expect(res).toBeFalsy();
  });

  test("claimUploaderRole: claim next uploader role with receipt code 0", async () => {
    // ARRANGE
    const executeMock = jest.fn().mockResolvedValue({
      code: 0,
    });

    const claimUploaderRoleMock = jest.fn().mockResolvedValue({
      txHash: "test_hash",
      execute: executeMock,
    });

    core.client = {
      kyve: {
        v1beta1: {
          base: {
            claimUploaderRole: claimUploaderRoleMock,
          },
        },
      },
    } as any;

    core.pool = {
      bundle_proposal: {
        next_uploader: "",
      },
    } as Pool;

    // ACT
    const res = await claimUploaderRole.call(core);

    // ASSERT
    expect(claimUploaderRoleMock).toHaveBeenCalledTimes(1);
    expect(claimUploaderRoleMock).toHaveBeenNthCalledWith(1, { id: "0" });

    expect(executeMock).toHaveBeenCalledTimes(1);

    expect(res).toBeTruthy();

    expect(loggerDebug).toHaveBeenCalledTimes(2);
    expect(loggerDebug).toHaveBeenNthCalledWith(
      1,
      `Attempting to claim uploader role`
    );
    expect(loggerDebug).toHaveBeenNthCalledWith(
      2,
      `ClaimUploaderRole = ${"test_hash"}`
    );

    expect(loggerInfo).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenNthCalledWith(
      1,
      `Successfully claimed uploader role\n`
    );
  });

  test("claimUploaderRole: claim next uploader role with receipt code 1", async () => {
    // ARRANGE
    const executeMock = jest.fn().mockResolvedValue({
      code: 1,
    });

    const claimUploaderRoleMock = jest.fn().mockResolvedValue({
      txHash: "test_hash",
      execute: executeMock,
    });

    core.client = {
      kyve: {
        v1beta1: {
          base: {
            claimUploaderRole: claimUploaderRoleMock,
          },
        },
      },
    } as any;

    core.pool = {
      bundle_proposal: {
        next_uploader: "",
      },
    } as Pool;

    // ACT
    const res = await claimUploaderRole.call(core);

    // ASSERT
    expect(claimUploaderRoleMock).toHaveBeenCalledTimes(1);
    expect(claimUploaderRoleMock).toHaveBeenNthCalledWith(1, { id: "0" });

    expect(executeMock).toHaveBeenCalledTimes(1);

    expect(res).toBeFalsy();

    expect(loggerDebug).toHaveBeenCalledTimes(2);
    expect(loggerDebug).toHaveBeenNthCalledWith(
      1,
      `Attempting to claim uploader role`
    );
    expect(loggerDebug).toHaveBeenNthCalledWith(
      2,
      `ClaimUploaderRole = ${"test_hash"}`
    );

    expect(loggerInfo).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenNthCalledWith(
      1,
      `Could not claim uploader role. Continuing ...\n`
    );
  });

  test("claimUploaderRole: claim next uploader role with error", async () => {
    // ARRANGE
    const executeMock = jest.fn().mockRejectedValue(new Error("Tx failed"));

    const claimUploaderRoleMock = jest.fn().mockResolvedValue({
      txHash: "test_hash",
      execute: executeMock,
    });

    core.client = {
      kyve: {
        v1beta1: {
          base: {
            claimUploaderRole: claimUploaderRoleMock,
          },
        },
      },
    } as any;

    core.pool = {
      bundle_proposal: {
        next_uploader: "",
      },
    } as Pool;

    // ACT
    const res = await claimUploaderRole.call(core);

    // ASSERT
    expect(claimUploaderRoleMock).toHaveBeenCalledTimes(1);
    expect(claimUploaderRoleMock).toHaveBeenNthCalledWith(1, { id: "0" });

    expect(executeMock).toHaveBeenCalledTimes(1);

    expect(res).toBeFalsy();

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenNthCalledWith(
      1,
      " Failed to claim uploader role. Continuing ...\n"
    );

    expect(loggerDebug).toHaveBeenCalledTimes(3);
    expect(loggerDebug).toHaveBeenNthCalledWith(3, new Error("Tx failed"));
  });
});
