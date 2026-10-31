import React, { useState } from "react";
import { useStore, saveSettings, scan, pickFolder, toast, updateTag, deleteTag, createTag, clearSession } from "../store";
import { analyzeUnanalyzed, analyzeTracks } from "../analysis";
import { TagChip } from "./common";

export function FolderSetup({ compact }: { compact?: boolean }) {
  const settings = useStore((s) => s.settings);
  const [dir, setDir] = useState(settings.musicDir);
  const [busy, setBusy] = useState(false);
  const go = async (path = dir) => {
    setBusy(true);
    try {
      await saveSettings({ musicDir: path });
      const r = await scan();
      toast(`Scanned ${r.found} files · ${r.added} new${r.updated ? ` · ${r.updated} updated` : ""}${r.missing ? ` · ${r.missing} missing` : ""}`);
      if (r.added) analyzeUnanalyzed();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`folder-setup ${compact ? "compact" : ""}`}>
      <div className="row">
        <input className="input mono" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/Users/you/Music/DJ" onKeyDown={(e) => e.key === "Enter" && go()} />
        {settings.platform === "darwin" && (
          <button className="btn" onClick={async () => { try { const p = await pickFolder(); if (p) { setDir(p); go(p); } } catch (e: any) { toast(e.message); } }}>Browse…</button>
        )}
        <button className="btn btn-primary" disabled={busy || !dir.trim()} onClick={() => go()}>{busy ? "Scanning…" : "Save & scan"}</button>
      </div>
      <p className="muted small">Sub-folders are included. Supported: MP3, WAV, AIFF, FLAC, M4A/AAC, OGG. Your files are never modified.</p>
    </div>
  );
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const tags = useStore((s) => s.tags);
  const tracks = useStore((s) => s.tracks);
  const [newTag, setNewTag] = useState("");
  const analyzed = tracks.filter((t) => t.analyzed_at && !t.analysis_error).length;
  const failed = tracks.filter((t) => t.analysis_error).length;
  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="cs-card">
        <h2>Music folder</h2>
        <FolderSetup compact />
      </section>

      <section className="cs-card">
        <h2>Key display</h2>
        <div className="seg">
          {([["camelot", "Camelot (8A)"], ["musical", "Musical (Am)"], ["openkey", "Open Key (1m)"]] as const).map(([v, l]) => (
            <button key={v} className={settings.keyNotation === v ? "on" : ""} onClick={() => saveSettings({ keyNotation: v })}>{l}</button>
          ))}
        </div>
      </section>

      <section className="cs-card">
        <h2>Analysis</h2>
        <p className="muted">{analyzed} of {tracks.length} tracks analyzed{failed ? ` · ${failed} failed` : ""}. Analysis runs in this browser tab — keep it open while it works. Values you edit by hand are never overwritten by automatic analysis.</p>
        <div className="row">
          <button className="btn" onClick={analyzeUnanalyzed}>Analyze new tracks</button>
          {failed > 0 && <button className="btn" onClick={() => analyzeTracks(tracks.filter((t) => t.analysis_error).map((t) => t.id))}>Retry failed</button>}
          <button className="btn btn-danger-ghost" onClick={() => confirm("Re-analyze every track? Manual key/BPM edits will be replaced.") && analyzeTracks(tracks.map((t) => t.id), true)}>Re-analyze everything</button>
        </div>
        <p className="muted small">Tip: AIFF files decode in Safari but not Chrome. If AIFFs fail, run the analysis once from Safari.</p>
      </section>

      <section className="cs-card">
        <h2>Tags</h2>
        <div className="tag-admin">
          {tags.map((t) => (
            <div key={t.id} className="tag-admin-row">
              <input type="color" value={t.color} onChange={(e) => updateTag(t.id, { color: e.target.value })} />
              <TagChip tag={t} />
              <button className="link" onClick={() => { const n = prompt("Rename tag", t.name); if (n?.trim()) updateTag(t.id, { name: n.trim() }); }}>Rename</button>
              <button className="link danger" onClick={() => confirm(`Delete tag “${t.name}”?`) && deleteTag(t.id)}>Delete</button>
            </div>
          ))}
        </div>
        <div className="row">
          <input className="input" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag name" onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) { createTag(newTag.trim()); setNewTag(""); } }} />
          <button className="btn" disabled={!newTag.trim()} onClick={() => { createTag(newTag.trim()); setNewTag(""); }}>Add tag</button>
        </div>
      </section>

      <section className="cs-card">
        <h2>Live session</h2>
        <p className="muted">Clears the “now playing” track and the played-tonight history.</p>
        <button className="btn" onClick={clearSession}>Reset session</button>
      </section>

      <section className="cs-card">
        <h2>Keyboard shortcuts</h2>
        <table className="cs-table shortcuts"><tbody>
          {[["Space", "Play / pause"], ["↑ ↓", "Move selection"], ["Enter", "Play selected from the start"], ["P", "Preview the groove (jump to ⅓)"], ["L", "Set selected as live (now playing)"], ["/", "Focus search"], ["⌘-click / ⇧-click", "Multi-select"], ["Esc", "Clear search"]].map(([k, d]) => (
            <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>
          ))}
        </tbody></table>
      </section>
    </div>
  );
}
