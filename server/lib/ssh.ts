import { spawn } from "node:child_process";

export interface SSHConfig {
  host: string;
  user?: string;
  port?: number;
}

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function execSSH(
  config: SSHConfig,
  command: string,
  timeout = 30000
): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "-o", `ConnectTimeout=${Math.floor(timeout / 1000)}`,
    ];

    if (config.port && config.port !== 22) {
      args.push("-p", String(config.port));
    }

    const user = config.user || "root";
    args.push(`${user}@${config.host}`, command);

    console.log(`[ssh] Executing: ssh ${args.slice(0, -1).join(" ")} "<command>"`);
    console.log(`[ssh] Target: ${user}@${config.host}`);

    let stdout = "";
    let stderr = "";

    const ssh = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });

    const timeoutId = setTimeout(() => {
      console.log(`[ssh] TIMEOUT after ${timeout}ms`);
      ssh.kill("SIGTERM");
      reject(new Error(`SSH timeout after ${timeout}ms`));
    }, timeout);

    ssh.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    ssh.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ssh.on("close", (code) => {
      clearTimeout(timeoutId);
      console.log(`[ssh] Exit code: ${code}`);
      console.log(`[ssh] stdout (${stdout.length} chars):`, stdout.slice(0, 500));
      if (stderr) console.log(`[ssh] stderr:`, stderr);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    ssh.on("error", (err) => {
      clearTimeout(timeoutId);
      console.log(`[ssh] ERROR:`, err.message);
      reject(err);
    });
  });
}
