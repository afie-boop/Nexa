const workspace = require("./workspace");
const git = require("./git");
const command = require("./command");
const { generateDiff } = require("./diff");
const { checkPermissionRequirement } = require("./permissions");

// Tool Declarations for LLM Prompt / OpenRouter schema
const TOOL_DEFINITIONS = [
  {
    name: "list_files",
    description: "Senaraikan fail dan direktori dalam ruang kerja (workspace).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Direktori relatif (lalai: '' untuk root)" }
      }
    }
  },
  {
    name: "read_file",
    description: "Baca kandungan fail teks dalam ruang kerja.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Laluan fail relatif" }
      },
      required: ["path"]
    }
  },
  {
    name: "search_code",
    description: "Cari teks atau kod dalam semua fail ruang kerja.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci atau teks yang dicari" },
        path: { type: "string", description: "Direktori relatif untuk dihadkan" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_file",
    description: "Cipta fail baru dalam ruang kerja dengan kandungan yang diberikan.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Laluan fail relatif" },
        content: { type: "string", description: "Kandungan fail" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "edit_file",
    description: "Kemas kini atau ubah kandungan fail sedia ada dalam ruang kerja.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Laluan fail relatif" },
        content: { type: "string", description: "Kandungan fail baru yang lengkap" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "delete_file",
    description: "Padamkan fail atau direktori daripada ruang kerja.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Laluan fail relatif untuk dipadam" }
      },
      required: ["path"]
    }
  },
  {
    name: "run_command",
    description: "Jalankan perintah terminal di ruang kerja (contoh: npm run build, npm test).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Perintah terminal untuk dijalankan" }
      },
      required: ["command"]
    }
  },
  {
    name: "git_status",
    description: "Dapatkan status semasa repository Git ruang kerja.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "git_diff",
    description: "Dapatkan perbezaan (diff) fail yang diubah dalam repository Git.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];

async function executeTool(toolName, args) {
  const name = toolName.toLowerCase();
  const filePath = args.path || args.filePath;

  switch (name) {
    case "list_files":
      return workspace.list_files(filePath || "");
    case "read_file":
      return workspace.read_file(filePath);
    case "search_code":
      return workspace.search_code(args.query, filePath || "");
    case "create_file":
      return workspace.create_file(filePath, args.content || "");
    case "edit_file":
      return workspace.edit_file(filePath, args.content || "");
    case "delete_file":
      return workspace.delete_file(filePath);
    case "run_command":
      return await command.run_command(args.command);
    case "git_status":
      return git.git_status();
    case "git_diff":
      return git.git_diff();
    default:
      throw new Error(`Alat '${toolName}' tidak dikenali.`);
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  checkPermissionRequirement,
  generateDiff
};
