const { exec } = require("child_process");
const { WORKSPACE_ROOT } = require("./workspace");

function run_command(command) {
  return new Promise((resolve) => {
    if (!command || typeof command !== "string") {
      return resolve({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Arahan terminal tidak sah."
      });
    }

    // Safety check for extremely dangerous destructive operations targeting root
    const dangerousPatterns = [/rm\s+-rf\s+\/$/, /shutdown/, /reboot/, /mkfs/];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command.trim())) {
        return resolve({
          success: false,
          exitCode: 1,
          stdout: "",
          stderr: "Arahan berbahaya dinafikan oleh keselamatan Nexa Agent."
        });
      }
    }

    exec(
      command,
      {
        cwd: WORKSPACE_ROOT,
        timeout: 30000, // 30 second timeout per command
        maxBuffer: 2 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        const exitCode = error ? (error.code || 1) : 0;
        const success = exitCode === 0;

        resolve({
          success,
          exitCode,
          stdout: stdout || "",
          stderr: stderr || (error ? error.message : "")
        });
      }
    );
  });
}

module.exports = {
  run_command
};
