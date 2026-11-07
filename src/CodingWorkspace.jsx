import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

const STORAGE_KEY = "axmchat_generated_files";

function readFileStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && !Array.isArray(saved) && Array.isArray(saved.files)) {
      return { files: saved.files, folders: Array.isArray(saved.folders) ? saved.folders : [], trash: Array.isArray(saved.trash) ? saved.trash : [] };
    }
  } catch (_) {}
  return { files: [], folders: [], trash: [] };
}

function parentPath(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function baseName(path) {
  return path.split("/").pop() || path;
}

function joinPath(folder, name) {
  return folder ? folder + "/" + name : name;
}

function extensionOf(path) {
  const name = baseName(path);
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "file";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatSize(value) { return formatBytes(new Blob([value || ""]).size); }

function FileGlyph({ folder = false, ext = "" }) {
  if (folder) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2H18.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /></svg>;
  const color = ({ jsx: "#e5bd61", js: "#e5bd61", ts: "#5da9e9", tsx: "#5da9e9", css: "#a88cf0", html: "#e58b65", json: "#d7b56d", png: "#7fc5a0", jpg: "#7fc5a0", svg: "#7fc5a0" })[ext] || "currentColor";
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={{ color }}><path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20z" /><path d="M14 3.5V8h4M9 13h6M9 16.5h6" /></svg>;
}

function downloadFile(file) {
  const blob = new Blob([file.content || ""], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = baseName(file.path);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const CodingWorkspace = forwardRef(function CodingWorkspace(props, ref) {
  const [store, setStore] = useState(readFileStore);
  const [currentFolder, setCurrentFolder] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState("name");
  const [filter, setFilter] = useState("all");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [selected, setSelected] = useState([]);
  const [menu, setMenu] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState("");

  useImperativeHandle(ref, () => ({
    chooseFiles: () => { setSelectionMode(value => !value); setSelected([]); },
    toggleSearch: () => setSearchOpen(value => !value),
    createFolder: () => { setShowFolderForm(true); setShowTrash(false); },
    openTrash: () => { setShowTrash(true); setSelected([]); setQuery(""); setCurrentFolder(""); }
  }), []);

  useEffect(() => {
    const refresh = () => setStore(readFileStore());
    window.addEventListener("axmchat-generated-files-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("axmchat-generated-files-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function commit(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStore(next);
      window.dispatchEvent(new Event("axmchat-generated-files-updated"));
      setNotice("Changes saved");
    } catch (_) {
      setNotice("Storage is full. Download files to keep a copy.");
    }
  }

  const visibleFolders = useMemo(() => {
    if (query.trim() || showTrash || filter === "files") return [];
    return store.folders
      .filter(path => parentPath(path) === currentFolder)
      .sort((a, b) => baseName(a).localeCompare(baseName(b)));
  }, [store.folders, currentFolder, query, showTrash, filter]);

  const visibleFiles = useMemo(() => {
    if (showTrash) return [];
    if (filter === "folders") return [];
    let list = store.files.filter(file => query.trim()
      ? file.path.toLowerCase().includes(query.trim().toLowerCase())
      : parentPath(file.path) === currentFolder);
    if (sort === "date") list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    else if (sort === "type") list.sort((a, b) => extensionOf(a.path).localeCompare(extensionOf(b.path)) || baseName(a.path).localeCompare(baseName(b.path)));
    else list.sort((a, b) => baseName(a.path).localeCompare(baseName(b.path)));
    return list;
  }, [store.files, currentFolder, query, sort, showTrash, filter]);

  const totalBytes = useMemo(() => store.files.reduce((sum, file) => sum + new Blob([file.content || ""]).size, 0), [store.files]);
  const breadcrumbs = currentFolder ? currentFolder.split("/") : [];

  function createFolder(event) {
    event.preventDefault();
    const name = folderName.trim().replace(/[\\/]/g, "");
    if (!name || name === "." || name === "..") return;
    const path = joinPath(currentFolder, name);
    if (store.folders.includes(path) || store.files.some(file => file.path === path)) {
      setNotice("An item with that name already exists.");
      return;
    }
    commit({ ...store, folders: [...store.folders, path] });
    setFolderName("");
    setShowFolderForm(false);
  }

  function renameItem(type, path) {
    const nextName = window.prompt("New name", baseName(path));
    if (!nextName || !nextName.trim()) return;
    const clean = nextName.trim().replace(/[\\/]/g, "");
    if (!clean || clean === "." || clean === "..") return;
    const nextPath = joinPath(parentPath(path), clean);
    if (nextPath === path) return;
    if (store.files.some(file => file.path === nextPath) || store.folders.includes(nextPath)) {
      setNotice("An item with that name already exists.");
      return;
    }
    if (type === "file") {
      commit({ ...store, files: store.files.map(file => file.path === path ? { ...file, path: nextPath, updatedAt: Date.now() } : file) });
    } else {
      const movePath = value => value === path || value.startsWith(path + "/") ? nextPath + value.slice(path.length) : value;
      commit({
        files: store.files.map(file => ({ ...file, path: movePath(file.path) })),
        folders: store.folders.map(movePath)
      });
      if (currentFolder === path || currentFolder.startsWith(path + "/")) setCurrentFolder(movePath(currentFolder));
    }
    setMenu(null);
  }

  function moveFile(path) {
    const destination = window.prompt("Move to folder path (leave blank for Files root)", parentPath(path));
    if (destination === null) return;
    const folder = destination.trim().split("/").filter(Boolean).join("/");
    if (folder && !store.folders.includes(folder)) {
      setNotice("That destination folder does not exist.");
      return;
    }
    const nextPath = joinPath(folder, baseName(path));
    if (nextPath !== path && (store.files.some(file => file.path === nextPath) || store.folders.includes(nextPath))) {
      setNotice("An item with that name already exists.");
      return;
    }
    commit({ ...store, files: store.files.map(file => file.path === path ? { ...file, path: nextPath, updatedAt: Date.now() } : file) });
    setMenu(null);
  }

  function deleteItem(type, path) {
    const label = type === "folder" ? "folder and everything inside it" : "file";
    if (!window.confirm("Move this " + label + " to Sampah?")) return;
    const deletedAt = Date.now();
    if (type === "file") {
      const removed = store.files.find(file => file.path === path);
      commit({ ...store, files: store.files.filter(file => file.path !== path), trash: [...(store.trash || []), { ...removed, type: "file", deletedAt }] });
    } else {
      const removedFiles = store.files.filter(file => file.path === path || file.path.startsWith(path + "/"));
      const removedFolders = store.folders.filter(folder => folder === path || folder.startsWith(path + "/"));
      commit({
        ...store,
        files: store.files.filter(file => !removedFiles.includes(file)),
        folders: store.folders.filter(folder => !removedFolders.includes(folder)),
        trash: [...(store.trash || []), ...removedFolders.map(folder => ({ type: "folder", path: folder, deletedAt })), ...removedFiles.map(file => ({ ...file, type: "file", deletedAt }))]
      });
      if (currentFolder === path || currentFolder.startsWith(path + "/")) setCurrentFolder(parentPath(path));
    }
    setSelected(previous => previous.filter(item => item !== path));
    setMenu(null);
  }

  function deleteSelected() {
    if (!selected.length || !window.confirm("Move " + selected.length + " selected file(s) to Sampah?")) return;
    const deletedAt = Date.now();
    const removed = store.files.filter(file => selected.includes(file.path));
    commit({ ...store, files: store.files.filter(file => !selected.includes(file.path)), trash: [...(store.trash || []), ...removed.map(file => ({ ...file, type: "file", deletedAt }))] });
    setSelected([]);
  }

  function restoreTrashItem(item) {
    const targetExists = store.files.some(file => file.path === item.path) || store.folders.includes(item.path);
    if (targetExists) { setNotice("An item with that name already exists."); return; }
    const trash = (store.trash || []).filter(entry => entry !== item);
    if (item.type === "folder") commit({ ...store, folders: [...store.folders, item.path], trash });
    else {
      const { type, deletedAt, ...file } = item;
      commit({ ...store, files: [...store.files, file], trash });
    }
  }

  function permanentlyDeleteTrashItem(item) {
    if (!window.confirm("Padam item ini secara kekal?")) return;
    commit({ ...store, trash: (store.trash || []).filter(entry => entry !== item) });
  }

  function toggleSelected(path) {
    setSelected(previous => previous.includes(path) ? previous.filter(item => item !== path) : [...previous, path]);
  }

  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every(file => selected.includes(file.path));

  return (
    <main className="fm-shell">
      {searchOpen && <div className="fm-toolbar">
        <label className="fm-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files and folders" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <label className="fm-sort"><span>Sort</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="date">Date modified</option><option value="type">File type</option></select></label>
      </div>}

      {showFolderForm && <form className="fm-create-folder" onSubmit={createFolder}>
        <input value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Folder name" autoFocus />
        <button type="submit" disabled={!folderName.trim()}>Create</button>
        <button type="button" className="fm-cancel" onClick={() => { setShowFolderForm(false); setFolderName(""); }}>Cancel</button>
      </form>}

      <nav className="fm-breadcrumbs" aria-label="Folder path">
        <button type="button" className="fm-home-crumb" onClick={() => { setCurrentFolder(""); setQuery(""); setShowTrash(false); }} aria-label="Folder utama">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>
        </button>
        <span className="fm-crumb-arrow">▸</span>
        {!showTrash && <em>{breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1] : "Storan AXMchat"}</em>}
        {showTrash && <em>Sampah</em>}{query && <em>Hasil carian</em>}
      </nav>
      <div className="fm-category-bar">
        <label className="fm-filter"><select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Tapis item">
          <option value="all">Semua</option><option value="folders">Folder</option><option value="files">Fail</option>
        </select><span aria-hidden="true">▾</span></label>
        <label className="fm-sort"><span className="fm-sort-icon">☷</span>
          <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Susun item">
            <option value="name">Nama</option><option value="date">Tarikh diubah</option><option value="type">Jenis fail</option>
          </select><span className="fm-sort-direction">↑</span>
        </label>
      </div>
      {selectionMode && selected.length > 0 && <div className="fm-selection">
        <span>{selected.length} selected</span>
        <button type="button" onClick={deleteSelected}>Delete selected</button>
        <button type="button" onClick={() => setSelected([])}>Clear</button>
      </div>}

      <section className="fm-content">
        {selectionMode && <div className="fm-list-head"><span></span><span></span><span></span><button type="button" onClick={() => setSelected(allVisibleSelected ? [] : visibleFiles.map(file => file.path))}>{allVisibleSelected ? "Clear" : "Select all"}</button></div>}

        {visibleFolders.map(path => {
          const childFolders = store.folders.filter(folder => parentPath(folder) === path).length;
          const childFiles = store.files.filter(file => parentPath(file.path) === path).length;
          const count = childFolders + childFiles;
          const latest = store.files.filter(file => file.path.startsWith(path + "/")).reduce((value, file) => Math.max(value, file.updatedAt || 0), 0);
          return <div className="fm-row fm-folder-row" key={path}>
            <button type="button" className="fm-item-main" onClick={() => { setCurrentFolder(path); setFilter("all"); }}>
              <span className="fm-item-icon folder"><FileGlyph folder /></span>
              <span className="fm-item-copy"><strong>{baseName(path)}</strong><small>{latest ? new Date(latest).toLocaleString("ms-MY", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) : "Folder"}</small></span>
            </button>
            <span className="fm-item-count">{count} item</span>
            <button type="button" className="fm-more" aria-label={"Actions for " + baseName(path)} onClick={() => setMenu(menu?.path === path ? null : { type: "folder", path })}>⋮</button>
            {menu?.path === path && <div className="fm-menu"><button onClick={() => renameItem("folder", path)}>Rename</button><button className="danger" onClick={() => deleteItem("folder", path)}>Delete</button></div>}
          </div>;
        })}

        {visibleFiles.map(file => {
          const ext = extensionOf(file.path);
          const checked = selected.includes(file.path);
          return <div className={"fm-row fm-file-row " + (checked ? "selected" : "")} key={file.path}>
            {selectionMode && <input className="fm-check" type="checkbox" checked={checked} onChange={() => toggleSelected(file.path)} aria-label={"Select " + baseName(file.path)} />}
            <button type="button" className="fm-item-main" onClick={() => setPreview(file)}>
              <span className="fm-item-icon"><FileGlyph ext={ext} /></span>
              <span className="fm-item-copy"><strong>{baseName(file.path)}</strong><small>{file.updatedAt ? new Date(file.updatedAt).toLocaleString("ms-MY", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) : ext.toUpperCase()}</small></span>
            </button>
            <span className="fm-item-count">{formatSize(file.content || "")}</span>
            <button type="button" className="fm-more" aria-label={"Actions for " + baseName(file.path)} onClick={() => setMenu(menu?.path === file.path ? null : { type: "file", path: file.path })}>⋮</button>
            {menu?.path === file.path && <div className="fm-menu">
              <button onClick={() => { setPreview(file); setMenu(null); }}>Open</button>
              <button onClick={() => { downloadFile(file); setMenu(null); }}>Download</button>
              <button onClick={() => renameItem("file", file.path)}>Rename</button>
              <button onClick={() => moveFile(file.path)}>Move to folder</button>
              <button className="danger" onClick={() => deleteItem("file", file.path)}>Delete</button>
            </div>}
          </div>;
        })}

        {showTrash && <div className="fm-trash-list">
          {!(store.trash || []).length ? <div className="fm-empty"><strong>Sampah kosong</strong><p>Fail yang dipadam akan muncul di sini.</p></div> : (store.trash || []).map((item, index) => <div className="fm-trash-row" key={item.path + "-" + index}>
            <span className="fm-item-icon"><FileGlyph folder={item.type === "folder"} ext={extensionOf(item.path)} /></span>
            <span className="fm-item-copy"><strong>{baseName(item.path)}</strong><small>{item.type === "folder" ? "Folder" : extensionOf(item.path).toUpperCase()}</small></span>
            <button type="button" onClick={() => restoreTrashItem(item)}>Pulihkan</button>
            <button type="button" className="danger" onClick={() => permanentlyDeleteTrashItem(item)}>Padam</button>
          </div>)}
        </div>}
        {!showTrash && !visibleFolders.length && !visibleFiles.length && <div className="fm-empty">
          <div className="fm-empty-icon"><FileGlyph folder /></div>
          <strong>{query ? "No matching files" : "No files yet"}</strong>
          <p>{query ? "Try another search term." : "When AXMchat creates code, tap “Save to Files” on its code block. Your saved files will appear here."}</p>
        </div>}
      </section>

      <footer className="fm-footer"><span>{showTrash ? (store.trash || []).length + " item dalam sampah" : store.files.length + " fail"}</span><span>{notice || "Stored on this device"}</span></footer>

      {preview && <div className="fm-preview-backdrop" onClick={() => setPreview(null)}>
        <section className="fm-preview" role="dialog" aria-modal="true" aria-label={baseName(preview.path)} onClick={event => event.stopPropagation()}>
          <header><div><strong>{baseName(preview.path)}</strong><small>{preview.path}</small></div><button type="button" onClick={() => setPreview(null)} aria-label="Close">×</button></header>
          <pre>{preview.content || ""}</pre>
          <footer><button type="button" onClick={() => downloadFile(preview)}>Download</button><button type="button" onClick={() => setPreview(null)}>Close</button></footer>
        </section>
      </div>}
    </main>
  );
});

export default CodingWorkspace;
