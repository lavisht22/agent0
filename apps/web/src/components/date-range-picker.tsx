import {
	Button,
	DateField,
	DateRangePicker as HeroDateRangePicker,
	ListBox,
	RangeCalendar,
	Select,
} from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { format } from "date-fns";
import { LucideArrowLeft, LucideCalendar } from "lucide-react";
import { useMemo, useState } from "react";

const DATE_PRESETS = [
	{
		key: "15min",
		label: "Last 15 Minutes",
	},
	{
		key: "1hr",
		label: "Last Hour",
	},
	{
		key: "24hr",
		label: "Last 24 Hours",
	},
	{
		key: "yesterday",
		label: "Yesterday",
	},
	{
		key: "3days",
		label: "Last 3 Days",
	},
	{
		key: "7days",
		label: "Last 7 Days",
	},
	{
		key: "custom",
		label: "Custom...",
	},
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

/**
 * Helper to compute from/to ISO dates based on a preset key
 */
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
		default:
			return null;
	}

	return {
		from: fromDate.toISOString(),
		to: toDate.toISOString(),
	};
}

/**
 * Helper to get display label for custom date range
 */
function getCustomDateLabel(value: DateRangeValue): string {
	if (value.startDate && value.endDate) {
		const start = new Date(value.startDate);
		const end = new Date(value.endDate);
		return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
	}
	return "Custom...";
}

export function DateRangePicker({
	value,
	onValueChange,
}: DateRangePickerProps) {
	const [showCustom, setShowCustom] = useState(
		!!(value.startDate && value.endDate && !value.datePreset),
	);
	const [isCalendarOpen, setIsCalendarOpen] = useState(false);

	// Convert custom date strings to CalendarDate for HeroDateRangePicker
	const customDateValue = useMemo(() => {
		if (value.startDate && value.endDate) {
			try {
				const startStr = value.startDate.split("T")[0];
				const endStr = value.endDate.split("T")[0];
				return {
					start: parseDate(startStr),
					end: parseDate(endStr),
				};
			} catch {
				return null;
			}
		}
		return null;
	}, [value.startDate, value.endDate]);

	// Determine selected key for the Select
	const selectedKey = value.datePreset || (showCustom ? "custom" : undefined);

	const displayLabel =
		selectedKey === "custom" && value.startDate && value.endDate
			? getCustomDateLabel(value)
			: selectedKey
				? DATE_PRESETS.find((p) => p.key === selectedKey)?.label ||
					"Select Date"
				: "Select Date";

	if (showCustom) {
		return (
			<HeroDateRangePicker
				className="w-64"
				aria-label="Select date range"
				value={customDateValue}
				maxValue={today(getLocalTimeZone())}
				isOpen={isCalendarOpen}
				onOpenChange={setIsCalendarOpen}
				onChange={(range) => {
					if (range) {
						const startDate = range.start.toDate(getLocalTimeZone());
						startDate.setHours(0, 0, 0, 0);

						const endDate = range.end.toDate(getLocalTimeZone());
						endDate.setHours(23, 59, 59, 999);

						onValueChange({
							startDate: startDate.toISOString(),
							endDate: endDate.toISOString(),
						});
					}
				}}
			>
				<DateField.Group>
					<DateField.InputContainer>
						<DateField.Input slot="start">
							{(segment) => <DateField.Segment segment={segment} />}
						</DateField.Input>
						<HeroDateRangePicker.RangeSeparator />
						<DateField.Input slot="end">
							{(segment) => <DateField.Segment segment={segment} />}
						</DateField.Input>
					</DateField.InputContainer>
					<DateField.Suffix>
						<HeroDateRangePicker.Trigger>
							<HeroDateRangePicker.TriggerIndicator />
						</HeroDateRangePicker.Trigger>
					</DateField.Suffix>
				</DateField.Group>
				<HeroDateRangePicker.Popover>
					<div className="p-2">
						<Button
							className="w-full"
							variant="tertiary"
							size="sm"
							onPress={() => {
								setShowCustom(false);
								setIsCalendarOpen(false);
								onValueChange({
									datePreset: "1hr",
								});
							}}
						>
							<LucideArrowLeft className="size-3.5" />
							Back to Presets
						</Button>
					</div>
					<RangeCalendar aria-label="Choose date range">
						<RangeCalendar.Header>
							<RangeCalendar.Heading />
							<RangeCalendar.NavButton slot="previous" />
							<RangeCalendar.NavButton slot="next" />
						</RangeCalendar.Header>
						<RangeCalendar.Grid>
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
				</HeroDateRangePicker.Popover>
			</HeroDateRangePicker>
		);
	}

	return (
		<Select
			aria-label="Filter by date range"
			placeholder="Select Date"
			className="w-44"
			value={selectedKey ?? null}
			onChange={(key) => {
				const stringKey = key as string | null;
				if (stringKey === "custom") {
					setShowCustom(true);
					setIsCalendarOpen(true);
				} else if (stringKey) {
					onValueChange({
						datePreset: stringKey,
					});
				}
			}}
		>
			<Select.Trigger>
				<LucideCalendar className="size-3.5" />
				<Select.Value>{displayLabel}</Select.Value>
				<Select.Indicator />
			</Select.Trigger>
			<Select.Popover className="w-[200px]">
				<ListBox items={DATE_PRESETS}>
					{(preset) => (
						<ListBox.Item id={preset.key} textValue={preset.label}>
							{preset.label}
							<ListBox.ItemIndicator />
						</ListBox.Item>
					)}
				</ListBox>
			</Select.Popover>
		</Select>
	);
}
