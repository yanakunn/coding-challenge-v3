import moment, { Moment } from "moment-timezone";

/**
 * Default timezone for the application
 */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * Parse a date string into a moment object
 * @param dateString - ISO 8601 date string
 * @param timezone - Optional timezone (defaults to UTC)
 * @returns Moment object
 */
export const parseDate = (
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE,
): Moment => {
  return moment.tz(dateString, timezone);
};

/**
 * Validate if a string is a valid ISO 8601 date
 * @param dateString - Date string to validate
 * @returns true if valid, false otherwise
 */
export const isValidISODate = (dateString: string): boolean => {
  return moment(dateString, moment.ISO_8601, true).isValid();
};

/**
 * Get current timestamp in ISO 8601 format
 * @param timezone - Optional timezone (defaults to UTC)
 * @returns ISO 8601 formatted string
 */
export const getCurrentTimestamp = (
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  return moment.tz(timezone).toISOString();
};

/**
 * Check if date1 is after date2
 * @param date1 - First date string
 * @param date2 - Second date string
 * @returns true if date1 is after date2
 */
export const isAfter = (date1: string, date2: string): boolean => {
  return moment(date1).isAfter(moment(date2));
};

/**
 * Check if date1 is before date2
 * @param date1 - First date string
 * @param date2 - Second date string
 * @returns true if date1 is before date2
 */
export const isBefore = (date1: string, date2: string): boolean => {
  return moment(date1).isBefore(moment(date2));
};

/**
 * Format a date to a specific format
 * @param dateString - Date string to format
 * @param format - Moment format string (defaults to ISO 8601)
 * @param timezone - Optional timezone (defaults to UTC)
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string,
  format: string = "YYYY-MM-DDTHH:mm:ss.SSSZ",
  timezone: string = DEFAULT_TIMEZONE,
): string => {
  return moment.tz(dateString, timezone).format(format);
};
