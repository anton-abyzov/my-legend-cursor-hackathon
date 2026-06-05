const { spawn } = require("node:child_process");
const { resolveTool } = require("./ffmpegPaths");

function runProcess(command, args = [], options = {}) {
  const { cwd, env, onLog } = options;
  const resolvedCommand = resolveTool(command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLog) onLog(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLog) onLog(text);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }

      const error = new Error(`${command} exited with code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

module.exports = { runProcess };
