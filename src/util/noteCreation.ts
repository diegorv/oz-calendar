import { App, TFile, Vault } from 'obsidian';

/**
 * Dependencies needed for note creation operations
 */
export interface NoteCreationDeps {
	app: App;
	vault: Vault;
}

/**
 * Configuration for creating a periodic note
 */
export interface NoteCreationConfig {
	fileName: string;
	folder: string;
	templatePath: string;
}

/**
 * Check if a file exists and open it if so
 * @returns true if file existed and was opened, false otherwise
 */
export async function openExistingNote(deps: NoteCreationDeps, filePath: string): Promise<boolean> {
	const existingFile = deps.vault.getAbstractFileByPath(filePath);
	if (existingFile) {
		await deps.app.workspace.openLinkText(filePath, '', false);
		return true;
	}
	return false;
}

/**
 * Get Templater plugin instance if available
 */
export function getTemplaterPlugin(app: App): any | null {
	return (app as any).plugins?.plugins?.['templater-obsidian'] ?? null;
}

/**
 * Get template file by path (without .md extension)
 */
export function getTemplateFile(vault: Vault, templatePath: string): TFile | null {
	if (!templatePath) return null;
	const file = vault.getAbstractFileByPath(`${templatePath}.md`);
	return file instanceof TFile ? file : null;
}

/**
 * Create all folders in a path recursively
 */
export async function ensureFoldersExist(vault: Vault, fullDir: string): Promise<void> {
	if (!fullDir) return;
	const parts = fullDir.split('/');
	let currentPath = '';
	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		const folderExists = vault.getAbstractFileByPath(currentPath);
		if (!folderExists) {
			await vault.createFolder(currentPath);
		}
	}
}

/**
 * Create a new note using Templater (if available) or create empty file
 */
export async function createNoteWithTemplate(
	deps: NoteCreationDeps,
	filePath: string,
	fullDir: string,
	fileName: string,
	templaterPlugin: any | null,
	templateFile: TFile | null
): Promise<void> {
	if (templateFile && templaterPlugin?.templater) {
		const justFileName = fileName.substring(fileName.lastIndexOf('/') + 1);
		await templaterPlugin.templater.create_new_note_from_template(
			templateFile,
			fullDir,
			justFileName,
			true // open file after creation
		);
		await new Promise((resolve) => setTimeout(resolve, 300));
	} else {
		await deps.vault.create(filePath, '');
		await new Promise((resolve) => setTimeout(resolve, 300));
		await deps.app.workspace.openLinkText(filePath, '', false);
	}
}

/**
 * Main entry point: Open existing note or create new one
 * Consolidates the full workflow used by all handlers
 */
export async function openOrCreateNote(deps: NoteCreationDeps, config: NoteCreationConfig): Promise<void> {
	const { fileName, folder, templatePath } = config;
	const filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;

	// Check if file exists and open it
	if (await openExistingNote(deps, filePath)) return;

	// Get Templater and template
	const templaterPlugin = getTemplaterPlugin(deps.app);
	const templateFile = getTemplateFile(deps.vault, templatePath);

	// Ensure folders exist (handles nested folders in format like YYYY/MM-MMM/filename)
	const fullDir = filePath.substring(0, filePath.lastIndexOf('/'));
	await ensureFoldersExist(deps.vault, fullDir);

	// Create the note
	await createNoteWithTemplate(deps, filePath, fullDir, fileName, templaterPlugin, templateFile);
}
