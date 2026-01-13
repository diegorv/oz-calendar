import { Menu } from 'obsidian';
import dayjs, { Dayjs } from 'dayjs';
import type OZCalendarPlugin from './main';
import { openOrCreateNote, getTemplaterPlugin, NoteCreationDeps } from './util/noteCreation';
import { CreateNoteModal } from './modal';

/**
 * Try to parse a date string using multiple formats
 * @returns Dayjs object if parsing succeeded, null otherwise
 */
function parseDate(text: string, formats: string[]): Dayjs | null {
	for (const format of formats) {
		const date = dayjs(text, format);
		if (date.isValid()) return date;
	}
	return null;
}

/**
 * Handles calendar click events for creating periodic notes
 */
export class CalendarNoteHandlers {
	private plugin: OZCalendarPlugin;

	constructor(plugin: OZCalendarPlugin) {
		this.plugin = plugin;
	}

	private get deps(): NoteCreationDeps {
		return {
			app: this.plugin.app,
			vault: this.plugin.app.vault,
		};
	}

	private get settings() {
		return this.plugin.settings;
	}

	/**
	 * Handle context menu on calendar day - shows menu with note creation options
	 */
	handleMonthDayContextMenu = (ev: MouseEvent, delegateTarget: HTMLElement): void => {
		const abbrItem = delegateTarget.querySelector('abbr[aria-label]');
		if (!abbrItem) return;

		const destDate = abbrItem.getAttr('aria-label');
		if (!destDate || destDate.length === 0) return;

		const dayjsDate = dayjs(destDate, 'MMMM D, YYYY');
		const menu = new Menu();

		menu.addItem((menuItem) => {
			menuItem
				.setTitle('Create a note for this date')
				.setIcon('create-new')
				.onClick(() => {
					const modal = new CreateNoteModal(this.plugin, dayjsDate.toDate());
					modal.open();
				});
		});

		// Add Daily Note option if Daily Notes and Templater are available
		const dailyNotesPlugin = (this.plugin.app as any).internalPlugins?.plugins?.['daily-notes'];
		const templaterPlugin = getTemplaterPlugin(this.plugin.app);

		if (dailyNotesPlugin?.enabled && templaterPlugin?.templater) {
			menu.addItem((menuItem) => {
				menuItem
					.setTitle('Create daily note for this date')
					.setIcon('calendar-plus')
					.onClick(async () => {
						const options = dailyNotesPlugin.instance?.options;
						if (!options) return;

						await openOrCreateNote(this.deps, {
							fileName: dayjsDate.format(options.format || 'YYYY-MM-DD'),
							folder: options.folder || '',
							templatePath: options.template || '',
						});
					});
			});
		}

		menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
	};

	/**
	 * Handle click on week number - creates/opens weekly note
	 */
	handleWeekNumberClick = async (ev: MouseEvent, delegateTarget: HTMLElement): Promise<void> => {
		// Find the index of the clicked week number tile
		const weekNumberTiles = document.querySelectorAll(
			'.oz-calendar-plugin-view .react-calendar__month-view__weekNumbers .react-calendar__tile'
		);
		let weekIndex = -1;
		weekNumberTiles.forEach((tile, index) => {
			if (tile === delegateTarget) {
				weekIndex = index;
			}
		});

		if (weekIndex === -1) return;

		// Get the corresponding day from the same week row to determine the actual date
		// Each week has 7 days, so the first day of week N is at index N * 7
		const dayTiles = document.querySelectorAll(
			'.oz-calendar-plugin-view .react-calendar__month-view__days .react-calendar__tile'
		);
		const firstDayOfWeek = dayTiles[weekIndex * 7];
		if (!firstDayOfWeek) return;

		// Get the date from the day's abbr element
		const abbrEl = firstDayOfWeek.querySelector('abbr[aria-label]');
		if (!abbrEl) return;

		const dateText = abbrEl.getAttribute('aria-label') || '';
		const weekDate = dayjs(dateText, 'MMMM D, YYYY');

		if (!weekDate.isValid()) return;

		await openOrCreateNote(this.deps, {
			fileName: weekDate.format(this.settings.weeklyNoteFormat),
			folder: this.settings.weeklyNoteFolder,
			templatePath: this.settings.weeklyNoteTemplate,
		});
	};

	/**
	 * Handle click on month label in calendar - creates/opens monthly note
	 */
	handleMonthLabelClick = async (ev: MouseEvent, delegateTarget: HTMLElement): Promise<void> => {
		ev.stopPropagation();
		ev.preventDefault();

		const labelText = delegateTarget.textContent;
		if (!labelText) return;

		const monthDate = parseDate(labelText, ['D MMM YYYY', 'DD MMM YYYY', 'MMM YYYY']);
		if (!monthDate) return;

		await openOrCreateNote(this.deps, {
			fileName: monthDate.startOf('month').format(this.settings.monthlyNoteFormat),
			folder: this.settings.monthlyNoteFolder,
			templatePath: this.settings.monthlyNoteTemplate,
		});
	};

	/**
	 * Handle mousedown capture on navigation label - creates/opens monthly or quarterly note
	 */
	handleMonthNavLabelClickCapture = async (ev: MouseEvent): Promise<void> => {
		const target = ev.target as HTMLElement;
		const labelButton = target.closest('.oz-calendar-plugin-view .react-calendar__navigation__label');
		if (!labelButton) return;

		// Check if clicked on quarter indicator
		const quarterElement = target.closest('.oz-calendar-quarter');
		if (quarterElement) {
			ev.stopPropagation();
			ev.preventDefault();
			await this.handleQuarterClick(labelButton as HTMLElement);
			return;
		}

		// Check if clicked on month-year
		const monthYearElement = target.closest('.oz-calendar-month-year');
		if (monthYearElement) {
			ev.stopPropagation();
			ev.preventDefault();
			await this.handleMonthClick(labelButton as HTMLElement);
			return;
		}

		// Fallback: if clicked somewhere else in the label, default to month
		ev.stopPropagation();
		ev.preventDefault();
		await this.handleMonthClick(labelButton as HTMLElement);
	};

	private handleMonthClick = async (labelButton: HTMLElement): Promise<void> => {
		const monthYearSpan = labelButton.querySelector('.oz-calendar-month-year');
		const labelText = monthYearSpan?.textContent;
		if (!labelText) return;

		const monthDate = parseDate(labelText, ['MMM YYYY', 'MMMM YYYY']);
		if (!monthDate) return;

		await openOrCreateNote(this.deps, {
			fileName: monthDate.startOf('month').format(this.settings.monthlyNoteFormat),
			folder: this.settings.monthlyNoteFolder,
			templatePath: this.settings.monthlyNoteTemplate,
		});
	};

	private handleQuarterClick = async (labelButton: HTMLElement): Promise<void> => {
		const monthYearSpan = labelButton.querySelector('.oz-calendar-month-year');
		const labelText = monthYearSpan?.textContent;
		if (!labelText) return;

		const monthDate = parseDate(labelText, ['MMM YYYY', 'MMMM YYYY']);
		if (!monthDate) return;

		// Calculate the start of the quarter
		const quarter = Math.ceil((monthDate.month() + 1) / 3);
		const quarterStartMonth = (quarter - 1) * 3; // 0, 3, 6, or 9
		const quarterDate = monthDate.month(quarterStartMonth).startOf('month');

		await openOrCreateNote(this.deps, {
			fileName: quarterDate.format(this.settings.quarterlyNoteFormat),
			folder: this.settings.quarterlyNoteFolder,
			templatePath: this.settings.quarterlyNoteTemplate,
		});
	};
}
