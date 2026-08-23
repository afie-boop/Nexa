function checkPermissionRequirement(toolName, args = {}) {
  const tool = toolName.toLowerCase();

  // Read-only tools are automatically allowed
  if (["list_files", "read_file", "search_code", "git_status", "git_diff"].includes(tool)) {
    return { requiresApproval: false };
  }

  // Deleting files ALWAYS requires approval
  if (tool === "delete_file") {
    return {
      requiresApproval: true,
      reason: `Memadam fail '${args.path || args.filePath}' memerlukan kebenaran jawatankuasa/pengguna.`
    };
  }

  // Creating files requires approval
  if (tool === "create_file") {
    return {
      requiresApproval: true,
      reason: `Mencipta fail baru '${args.path || args.filePath}' memerlukan kelulusan.`
    };
  }

  // Editing files requires approval
  if (tool === "edit_file") {
    return {
      requiresApproval: true,
      reason: `Mengemas kini fail '${args.path || args.filePath}' memerlukan kelulusan.`
    };
  }

  // Running terminal commands requires approval
  if (tool === "run_command") {
    const cmd = (args.command || "").toLowerCase().trim();
    if (cmd.includes("git commit")) {
      return {
        requiresApproval: true,
        reason: "Perintah 'git commit' memerlukan kebenaran pengguna."
      };
    }
    if (cmd.includes("git push")) {
      return {
        requiresApproval: true,
        reason: "Perintah 'git push' SENTIASA memerlukan kebenaran pengguna."
      };
    }
    return {
      requiresApproval: true,
      reason: `Menjalankan perintah terminal '${args.command}' memerlukan kelulusan.`
    };
  }

  // Default: require approval for any unknown write/exec action
  return {
    requiresApproval: true,
    reason: `Tindakan '${toolName}' memerlukan kelulusan.`
  };
}

module.exports = {
  checkPermissionRequirement
};
