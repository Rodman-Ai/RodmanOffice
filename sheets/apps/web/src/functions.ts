export type FunctionCategory =
  | "Math & Stats"
  | "Logic"
  | "Lookup & Reference"
  | "Text"
  | "Date & Time";

export type FunctionEntry = {
  name: string;
  category: FunctionCategory;
  signature: string;
  summary: string;
  example: string;
};

export const FUNCTIONS: FunctionEntry[] = [
  // Math & Stats (15)
  { name: "SUM", category: "Math & Stats", signature: "SUM(range, …)", summary: "Adds all numbers in the given ranges or values.", example: "=SUM(A1:A10)" },
  { name: "AVERAGE", category: "Math & Stats", signature: "AVERAGE(range, …)", summary: "Arithmetic mean of the numbers in the range.", example: "=AVERAGE(B2:B100)" },
  { name: "COUNT", category: "Math & Stats", signature: "COUNT(range, …)", summary: "Counts cells that contain numbers.", example: "=COUNT(A:A)" },
  { name: "COUNTA", category: "Math & Stats", signature: "COUNTA(range, …)", summary: "Counts non-empty cells (any type).", example: "=COUNTA(A1:A100)" },
  { name: "MIN", category: "Math & Stats", signature: "MIN(range, …)", summary: "Smallest numeric value in the inputs.", example: "=MIN(A1:A10)" },
  { name: "MAX", category: "Math & Stats", signature: "MAX(range, …)", summary: "Largest numeric value in the inputs.", example: "=MAX(A1:A10)" },
  { name: "MEDIAN", category: "Math & Stats", signature: "MEDIAN(range, …)", summary: "Middle value of the inputs.", example: "=MEDIAN(A1:A10)" },
  { name: "ROUND", category: "Math & Stats", signature: "ROUND(value, digits)", summary: "Rounds value to the given number of digits.", example: "=ROUND(A1, 2)" },
  { name: "SUMIF", category: "Math & Stats", signature: "SUMIF(range, criterion, [sum_range])", summary: "Sums cells that meet a criterion.", example: '=SUMIF(B:B, ">100", C:C)' },
  { name: "COUNTIF", category: "Math & Stats", signature: "COUNTIF(range, criterion)", summary: "Counts cells that meet a criterion.", example: '=COUNTIF(A:A, "Yes")' },
  { name: "AVERAGEIF", category: "Math & Stats", signature: "AVERAGEIF(range, criterion, [avg_range])", summary: "Averages cells that meet a criterion.", example: '=AVERAGEIF(A:A, ">0")' },
  { name: "ABS", category: "Math & Stats", signature: "ABS(value)", summary: "Absolute value of a number.", example: "=ABS(A1)" },
  { name: "MOD", category: "Math & Stats", signature: "MOD(value, divisor)", summary: "Remainder after division.", example: "=MOD(A1, 7)" },
  { name: "RAND", category: "Math & Stats", signature: "RAND()", summary: "Random number in [0, 1).", example: "=RAND()" },
  { name: "RANDBETWEEN", category: "Math & Stats", signature: "RANDBETWEEN(low, high)", summary: "Random integer between low and high inclusive.", example: "=RANDBETWEEN(1, 100)" },

  // Logic (7)
  { name: "IF", category: "Logic", signature: "IF(test, then, else)", summary: "Returns one value if test is true, another if false.", example: '=IF(A1>0, "Pos", "Neg")' },
  { name: "IFS", category: "Logic", signature: "IFS(test1, val1, test2, val2, …)", summary: "First test that is true wins.", example: '=IFS(A1<0,"-",A1=0,"0",A1>0,"+")' },
  { name: "AND", category: "Logic", signature: "AND(a, b, …)", summary: "True if every argument is true.", example: "=AND(A1>0, B1<10)" },
  { name: "OR", category: "Logic", signature: "OR(a, b, …)", summary: "True if any argument is true.", example: '=OR(A1="x", A1="y")' },
  { name: "NOT", category: "Logic", signature: "NOT(value)", summary: "Inverts a boolean.", example: "=NOT(A1)" },
  { name: "IFERROR", category: "Logic", signature: "IFERROR(value, fallback)", summary: "Returns fallback if value is an error.", example: '=IFERROR(A1/B1, "n/a")' },
  { name: "IFNA", category: "Logic", signature: "IFNA(value, fallback)", summary: "Returns fallback if value is #N/A.", example: '=IFNA(VLOOKUP(A1,T,2,FALSE), "")' },

  // Lookup & Reference (9)
  { name: "VLOOKUP", category: "Lookup & Reference", signature: "VLOOKUP(key, table, col, [exact])", summary: "Looks up key in the first column of table; returns the value in col.", example: "=VLOOKUP(A1, Customers!A:D, 2, FALSE)" },
  { name: "HLOOKUP", category: "Lookup & Reference", signature: "HLOOKUP(key, table, row, [exact])", summary: "Like VLOOKUP but searches the first row.", example: "=HLOOKUP(A1, A1:Z2, 2, FALSE)" },
  { name: "XLOOKUP", category: "Lookup & Reference", signature: "XLOOKUP(key, lookup_range, return_range, [if_missing])", summary: "Modern lookup — works left/right, returns a range.", example: '=XLOOKUP(A1, B:B, C:C, "n/a")' },
  { name: "INDEX", category: "Lookup & Reference", signature: "INDEX(range, row, [col])", summary: "Returns the value at the given offset inside a range.", example: "=INDEX(A1:C10, 3, 2)" },
  { name: "MATCH", category: "Lookup & Reference", signature: "MATCH(key, range, [type])", summary: "Returns the position of key in a range.", example: "=MATCH(A1, B:B, 0)" },
  { name: "CHOOSE", category: "Lookup & Reference", signature: "CHOOSE(index, val1, val2, …)", summary: "Picks the Nth argument by index.", example: '=CHOOSE(A1, "Low", "Med", "High")' },
  { name: "FILTER", category: "Lookup & Reference", signature: "FILTER(range, condition)", summary: "Keeps rows of range where condition is true.", example: "=FILTER(A:C, B:B>0)" },
  { name: "SORT", category: "Lookup & Reference", signature: "SORT(range, [col], [asc])", summary: "Sorts a range by the given column.", example: "=SORT(A1:C100, 2, FALSE)" },
  { name: "UNIQUE", category: "Lookup & Reference", signature: "UNIQUE(range)", summary: "Returns the distinct values in a range.", example: "=UNIQUE(A:A)" },

  // Text (11)
  { name: "CONCAT", category: "Text", signature: "CONCAT(text1, text2, …)", summary: "Joins text values end-to-end.", example: '=CONCAT(A1, " ", B1)' },
  { name: "LEFT", category: "Text", signature: "LEFT(text, [n])", summary: "First n characters of text.", example: "=LEFT(A1, 3)" },
  { name: "RIGHT", category: "Text", signature: "RIGHT(text, [n])", summary: "Last n characters of text.", example: "=RIGHT(A1, 4)" },
  { name: "MID", category: "Text", signature: "MID(text, start, length)", summary: "Substring starting at position start.", example: "=MID(A1, 2, 5)" },
  { name: "LEN", category: "Text", signature: "LEN(text)", summary: "Number of characters in text.", example: "=LEN(A1)" },
  { name: "LOWER", category: "Text", signature: "LOWER(text)", summary: "Converts text to lowercase.", example: "=LOWER(A1)" },
  { name: "UPPER", category: "Text", signature: "UPPER(text)", summary: "Converts text to uppercase.", example: "=UPPER(A1)" },
  { name: "TRIM", category: "Text", signature: "TRIM(text)", summary: "Removes extra whitespace from text.", example: "=TRIM(A1)" },
  { name: "SUBSTITUTE", category: "Text", signature: "SUBSTITUTE(text, find, replace, [n])", summary: "Replaces find with replace inside text.", example: '=SUBSTITUTE(A1, "-", " ")' },
  { name: "FIND", category: "Text", signature: "FIND(needle, text, [start])", summary: "Position of needle inside text (case-sensitive).", example: '=FIND("@", A1)' },
  { name: "TEXTJOIN", category: "Text", signature: "TEXTJOIN(delim, ignore_empty, range, …)", summary: "Joins values from a range with a delimiter.", example: '=TEXTJOIN(", ", TRUE, A1:A10)' },

  // Date & Time (8)
  { name: "TODAY", category: "Date & Time", signature: "TODAY()", summary: "Today's date (recalculates daily).", example: "=TODAY()" },
  { name: "NOW", category: "Date & Time", signature: "NOW()", summary: "Current date and time.", example: "=NOW()" },
  { name: "DATE", category: "Date & Time", signature: "DATE(year, month, day)", summary: "Builds a date from parts.", example: "=DATE(2026, 1, 15)" },
  { name: "YEAR", category: "Date & Time", signature: "YEAR(date)", summary: "Year component of a date.", example: "=YEAR(A1)" },
  { name: "MONTH", category: "Date & Time", signature: "MONTH(date)", summary: "Month component (1-12).", example: "=MONTH(A1)" },
  { name: "DAY", category: "Date & Time", signature: "DAY(date)", summary: "Day-of-month component (1-31).", example: "=DAY(A1)" },
  { name: "WEEKDAY", category: "Date & Time", signature: "WEEKDAY(date, [type])", summary: "Day of week as a number.", example: "=WEEKDAY(A1)" },
  { name: "EOMONTH", category: "Date & Time", signature: "EOMONTH(date, months)", summary: "Last day of the month, offset by months.", example: "=EOMONTH(A1, 0)" },
];

export const FUNCTION_CATEGORIES: FunctionCategory[] = [
  "Math & Stats",
  "Logic",
  "Lookup & Reference",
  "Text",
  "Date & Time",
];
