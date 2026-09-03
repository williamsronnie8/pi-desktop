import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { DesktopProject, DesktopSessionSummary } from "../shared/types";

interface ProjectFile {
  projects: string[];
}

export class ProjectStore {
  constructor(private readonly filePath: string) {}

  async list(sessions: DesktopSessionSummary[]): Promise<DesktopProject[]> {
    const saved = await this.read();
    const byPath = new Map<string, DesktopProject>();
    const sessionCounts = new Map<string, { count: number; lastUsedAt: number }>();

    for (const session of sessions) {
      const current = sessionCounts.get(session.cwd) ?? { count: 0, lastUsedAt: 0 };
      current.count += 1;
      current.lastUsedAt = Math.max(current.lastUsedAt, session.updatedAt);
      sessionCounts.set(session.cwd, current);
    }

    const paths = new Set<string>([homedir(), ...saved.projects, ...sessionCounts.keys()]);
    for (const path of paths) {
      const activity = sessionCounts.get(path);
      byPath.set(path, {
        path,
        name: path === homedir() ? "Home" : basename(path) || path,
        pinned: path === homedir() || saved.projects.includes(path),
        lastUsedAt: activity?.lastUsedAt,
        sessionCount: activity?.count ?? 0,
      });
    }

    return [...byPath.values()].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name);
    });
  }

  async add(path: string): Promise<void> {
    const data = await this.read();
    if (!data.projects.includes(path) && path !== homedir()) data.projects.push(path);
    await this.write(data);
  }

  async remove(path: string): Promise<void> {
    const data = await this.read();
    data.projects = data.projects.filter((project) => project !== path);
    await this.write(data);
  }

  private async read(): Promise<ProjectFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as ProjectFile;
      return { projects: Array.isArray(parsed.projects) ? parsed.projects.filter((item) => typeof item === "string") : [] };
    } catch {
      return { projects: [] };
    }
  }

  private async write(data: ProjectFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = join(dirname(this.filePath), `.${basename(this.filePath)}.${process.pid}.tmp`);
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }
}
