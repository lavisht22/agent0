import {
	Button,
	DateField,
	Label,
	ListBox,
	Popover,
	RangeCalendar,
	TimeField,
} from "@heroui/react";
import {
	CalendarDate,
	CalendarDateTime,
	getLocalTimeZone,
	Time,
	today,
} from "@internationalized/date";
import { format } from "date-fns";
import { LucideCalendar, LucideChevronDown } from "lucide-react";
import { useState } from "react";

const DATE_PRESETS = [
	{ key: "15min", label: "Last 15 Minutes" },
	{ key: "1hr", label: "Last Hour" },
	{ key: "24hr", label: "Last 24 Hours" },
	{ key: "yesterday", label: "Yesterday" },
	{ key: "3days", label: "Last 3 Days" },
	{ key: "7days", label: "Last 7 Days" },
	{ key: "30days", label: "Last 30 Days" },
	{ key: "90days", label: "Last 90 Days" },
];

export type DateRangeValue = {
	datePreset?: string;
	startDate?: string;
	endDate?: string;
};

interface DateRangePickerProps {
	value: DateRangeValue;
	onValueChange: (value: DateRangeValue) => void;
}

export function computeDateRangeFromPreset(
	presetKey: string,
): { from: string; to: string } | null {
	const now = new Date();
	let fromDate: Date;
	const toDate = now;

	switch (presetKey) {
		case "15min":
			fromDate = new Date(now.getTime() - 15 * 60 * 1000);
			break;
		case "1hr":
			fromDate = new Date(now.getTime() - 60 * 60 * 1000);
			break;
		case "24hr":
			fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case "yesterday": {
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			yesterday.setHours(0, 0, 0, 0);
			fromDate = yesterday;
			const endOfYesterday = new Date(yesterday);
			endOfYesterday.setHours(23, 59, 59, 999);
			return {
				from: fromDate.toISOString(),
				to: endOfYesterday.toISOString(),
			};
		}
		case "3days":
			fromDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
			break;
		case "7days":
			fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		case "30days":
			fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case "90days":
			fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
			break;
		default:
			return null;
	}

	return {
		from: fromDate.toISOString(),
		to: toDate.toISOString(),
	};
}

// --- CalendarDateTime helpers (all in the user's local timezone) ---

// Build a local-zone CalendarDateTime from a UTC ISO string so the date + time
// render in the user's timezone.
function isoToLocalDateTime(iso: string): CalendarDateTime {
	const d = new Date(iso);
	return new CalendarDateTime(
		d.getFullYear(),
		d.getMonth() + 1,
		d.getDate(),
		d.getHours(),
		d.getMinutes(),
		d.getSeconds(),
	);
}

function dateTimeToIso(dt: CalendarDateTime): string {
	return dt.toDate(getLocalTimeZone()).toISOString();
}

function datePart(dt: CalendarDateTime): CalendarDate {
	return new CalendarDate(dt.year, dt.month, dt.day);
}

function timePart(dt: CalendarDateTime): Time {
	return new Time(dt.hour, dt.minute, dt.second);
}

function withDate(dt: CalendarDateTime, d: CalendarDate): CalendarDateTime {
	return new CalendarDateTime(
		d.year,
		d.month,
		d.day,
		dt.hour,
		dt.minute,
		dt.second,
	);
}

function withTime(dt: CalendarDateTime, t: Time): CalendarDateTime {
	return new CalendarDateTime(
		dt.year,
		dt.month,
		dt.day,
		t.hour,
		t.minute,
		t.second,
	);
}

function getTriggerLabel(value: DateRangeValue): string {
	if (value.datePreset) {
		return (
			DATE_PRESETS.find((p) => p.key === value.datePreset)?.label ??
			"Select Date"
		);
	}
	if (value.startDate && value.endDate) {
		const start = new Date(value.startDate);
		const end = new Date(value.endDate);
		const sameDay = start.toDateString() === end.toDateString();
		const startLabel = format(start, "MMM d, h:mm a");
		const endLabel = format(end, sameDay ? "h:mm a" : "MMM d, h:mm a");
		return `${startLabel} - ${endLabel}`;
	}
	return "Select Date";
}

// Seed the editable draft from the committed value (preset → computed range).
function seedDraft(value: DateRangeValue): {
	start: CalendarDateTime;
	end: CalendarDateTime;
	preset: string | null;
} {
	if (value.startDate && value.endDate && !value.datePreset) {
		return {
			start: isoToLocalDateTime(value.startDate),
			end: isoToLocalDateTime(value.endDate),
			preset: null,
		};
	}

	const presetKey = value.datePreset ?? "1hr";
	const range = computeDateRangeFromPreset(presetKey) ?? {
		from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
		to: new Date().toISOString(),
	};
	return {
		start: isoToLocalDateTime(range.from),
		end: isoToLocalDateTime(range.to),
		preset: value.datePreset ?? null,
	};
}

export function DateRangePicker({
	value,
	onValueChange,
}: DateRangePickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const initial = seedDraft(value);
	const [draftStart, setDraftStart] = useState<CalendarDateTime>(initial.start);
	const [draftEnd, setDraftEnd] = useState<CalendarDateTime>(initial.end);
	const [draftPreset, setDraftPreset] = useState<string | null>(initial.preset);

	const maxDate = today(getLocalTimeZone());
	const isInvalid = draftStart.compare(draftEnd) > 0;

	const open = () => {
		const next = seedDraft(value);
		setDraftStart(next.start);
		setDraftEnd(next.end);
		setDraftPreset(next.preset);
		setIsOpen(true);
	};

	const applyPreset = (key: string) => {
		const range = computeDateRangeFromPreset(key);
		if (!range) return;
		setDraftStart(isoToLocalDateTime(range.from));
		setDraftEnd(isoToLocalDateTime(range.to));
		setDraftPreset(key);
	};

	// Editing the calendar or time fields turns the selection into a custom range.
	const editStart = (next: CalendarDateTime) => {
		setDraftStart(next);
		setDraftPreset(null);
	};
	const editEnd = (next: CalendarDateTime) => {
		setDraftEnd(next);
		setDraftPreset(null);
	};

	const update = () => {
		if (draftPreset) {
			onValueChange({ datePreset: draftPreset });
		} else {
			onValueChange({
				startDate: dateTimeToIso(draftStart),
				endDate: dateTimeToIso(draftEnd),
			});
		}
		setIsOpen(false);
	};

	return (
		<Popover
			isOpen={isOpen}
			onOpenChange={(next) => (next ? open() : setIsOpen(false))}
		>
			<Popover.Trigger className="relative isolate inline-flex min-h-9 max-w-72 cursor-pointer items-center gap-2 rounded-field border border-[var(--color-field-border)] bg-field py-2 pl-3 pr-8 text-sm text-field-foreground shadow-field outline-none transition hover:bg-field-hover">
				<LucideCalendar className="size-3.5 shrink-0 text-muted" />
				<span className="truncate">{getTriggerLabel(value)}</span>
				<LucideChevronDown
					className={`absolute right-2 size-4 text-field-placeholder transition ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</Popover.Trigger>

			<Popover.Content placement="bottom start">
				<Popover.Dialog className="p-0 flex flex-col">
					<div className="flex items-stretch">
						{/* Calendar + time fields */}
						<div className="p-4 flex flex-col gap-4 w-[300px]">
							<RangeCalendar
								aria-label="Choose date range"
								maxValue={maxDate}
								value={{ start: draftStart, end: draftEnd }}
								onChange={(range) => {
									if (range) {
										editStart(withDate(draftStart, datePart(range.start)));
										editEnd(withDate(draftEnd, datePart(range.end)));
									}
								}}
							>
								<RangeCalendar.Header>
									<RangeCalendar.NavButton slot="previous" />
									<RangeCalendar.Heading />
									<RangeCalendar.NavButton slot="next" />
								</RangeCalendar.Header>
								<RangeCalendar.Grid weekdayStyle="short">
									<RangeCalendar.GridHeader>
										{(day) => (
											<RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
										)}
									</RangeCalendar.GridHeader>
									<RangeCalendar.GridBody>
										{(date) => <RangeCalendar.Cell date={date} />}
									</RangeCalendar.GridBody>
								</RangeCalendar.Grid>
							</RangeCalendar>

							<div className="flex flex-col gap-2 border-t border-default-200 pt-3">
								<div className="flex items-center gap-2">
									<Label className="w-10 shrink-0 text-xs text-muted">
										Start
									</Label>
									<DateField
										aria-label="Start date"
										granularity="day"
										maxValue={maxDate}
										value={datePart(draftStart)}
										onChange={(d) => d && editStart(withDate(draftStart, d))}
									>
										<DateField.Group variant="secondary">
											<DateField.InputContainer>
												<DateField.Input>
													{(segment) => <DateField.Segment segment={segment} />}
												</DateField.Input>
											</DateField.InputContainer>
										</DateField.Group>
									</DateField>
									<TimeField
										aria-label="Start time"
										value={timePart(draftStart)}
										onChange={(t) => t && editStart(withTime(draftStart, t))}
									>
										<TimeField.Group variant="secondary">
											<TimeField.InputContainer>
												<TimeField.Input>
													{(segment) => <TimeField.Segment segment={segment} />}
												</TimeField.Input>
											</TimeField.InputContainer>
										</TimeField.Group>
									</TimeField>
								</div>

								<div className="flex items-center gap-2">
									<Label className="w-10 shrink-0 text-xs text-muted">
										End
									</Label>
									<DateField
										aria-label="End date"
										granularity="day"
										maxValue={maxDate}
										value={datePart(draftEnd)}
										onChange={(d) => d && editEnd(withDate(draftEnd, d))}
									>
										<DateField.Group variant="secondary">
											<DateField.InputContainer>
												<DateField.Input>
													{(segment) => <DateField.Segment segment={segment} />}
												</DateField.Input>
											</DateField.InputContainer>
										</DateField.Group>
									</DateField>
									<TimeField
										aria-label="End time"
										value={timePart(draftEnd)}
										onChange={(t) => t && editEnd(withTime(draftEnd, t))}
									>
										<TimeField.Group variant="secondary">
											<TimeField.InputContainer>
												<TimeField.Input>
													{(segment) => <TimeField.Segment segment={segment} />}
												</TimeField.Input>
											</TimeField.InputContainer>
										</TimeField.Group>
									</TimeField>
								</div>
							</div>
						</div>

						{/* Presets */}
						<div className="border-l border-default-200 p-2 w-44 shrink-0">
							<p className="px-2 pt-1 pb-2 text-xs font-medium text-muted">
								Presets
							</p>
							<ListBox
								aria-label="Date range presets"
								selectionMode="single"
								selectedKeys={draftPreset ? [draftPreset] : []}
								onSelectionChange={(keys) => {
									const key = Array.from(keys)[0] as string | undefined;
									if (key) applyPreset(key);
								}}
							>
								{DATE_PRESETS.map((preset) => (
									<ListBox.Item
										key={preset.key}
										id={preset.key}
										textValue={preset.label}
									>
										{preset.label}
										<ListBox.ItemIndicator />
									</ListBox.Item>
								))}
							</ListBox>
						</div>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-end gap-2 border-t border-default-200 p-3">
						<Button
							size="sm"
							variant="tertiary"
							onPress={() => setIsOpen(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							variant="primary"
							isDisabled={isInvalid}
							onPress={update}
						>
							Update
						</Button>
					</div>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
}
