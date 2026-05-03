# Function reference

The 50 most-used spreadsheet functions, all available in AiCell out of the box (powered by HyperFormula). Use **Insert → Function…** in the app to search and insert any of these.

## Math & Stats

| Name | Signature | What it does | Example |
|---|---|---|---|
| SUM | `SUM(range, …)` | Adds all numbers in the given ranges or values. | `=SUM(A1:A10)` |
| AVERAGE | `AVERAGE(range, …)` | Arithmetic mean of the numbers in the range. | `=AVERAGE(B2:B100)` |
| COUNT | `COUNT(range, …)` | Counts cells that contain numbers. | `=COUNT(A:A)` |
| COUNTA | `COUNTA(range, …)` | Counts non-empty cells (any type). | `=COUNTA(A1:A100)` |
| MIN | `MIN(range, …)` | Smallest numeric value in the inputs. | `=MIN(A1:A10)` |
| MAX | `MAX(range, …)` | Largest numeric value in the inputs. | `=MAX(A1:A10)` |
| MEDIAN | `MEDIAN(range, …)` | Middle value of the inputs. | `=MEDIAN(A1:A10)` |
| ROUND | `ROUND(value, digits)` | Rounds value to the given number of digits. | `=ROUND(A1, 2)` |
| SUMIF | `SUMIF(range, criterion, [sum_range])` | Sums cells that meet a criterion. | `=SUMIF(B:B, ">100", C:C)` |
| COUNTIF | `COUNTIF(range, criterion)` | Counts cells that meet a criterion. | `=COUNTIF(A:A, "Yes")` |
| AVERAGEIF | `AVERAGEIF(range, criterion, [avg_range])` | Averages cells that meet a criterion. | `=AVERAGEIF(A:A, ">0")` |
| ABS | `ABS(value)` | Absolute value of a number. | `=ABS(A1)` |
| MOD | `MOD(value, divisor)` | Remainder after division. | `=MOD(A1, 7)` |
| RAND | `RAND()` | Random number in `[0, 1)`. | `=RAND()` |
| RANDBETWEEN | `RANDBETWEEN(low, high)` | Random integer between low and high inclusive. | `=RANDBETWEEN(1, 100)` |

## Logic

| Name | Signature | What it does | Example |
|---|---|---|---|
| IF | `IF(test, then, else)` | Returns one value if test is true, another if false. | `=IF(A1>0, "Pos", "Neg")` |
| IFS | `IFS(test1, val1, test2, val2, …)` | First test that is true wins. | `=IFS(A1<0,"-",A1=0,"0",A1>0,"+")` |
| AND | `AND(a, b, …)` | True if every argument is true. | `=AND(A1>0, B1<10)` |
| OR | `OR(a, b, …)` | True if any argument is true. | `=OR(A1="x", A1="y")` |
| NOT | `NOT(value)` | Inverts a boolean. | `=NOT(A1)` |
| IFERROR | `IFERROR(value, fallback)` | Returns fallback if value is an error. | `=IFERROR(A1/B1, "n/a")` |
| IFNA | `IFNA(value, fallback)` | Returns fallback if value is `#N/A`. | `=IFNA(VLOOKUP(A1,T,2,FALSE), "")` |

## Lookup & Reference

| Name | Signature | What it does | Example |
|---|---|---|---|
| VLOOKUP | `VLOOKUP(key, table, col, [exact])` | Looks up key in the first column of table; returns the value in col. | `=VLOOKUP(A1, Customers!A:D, 2, FALSE)` |
| HLOOKUP | `HLOOKUP(key, table, row, [exact])` | Like VLOOKUP but searches the first row. | `=HLOOKUP(A1, A1:Z2, 2, FALSE)` |
| XLOOKUP | `XLOOKUP(key, lookup_range, return_range, [if_missing])` | Modern lookup — works left/right, returns a range. | `=XLOOKUP(A1, B:B, C:C, "n/a")` |
| INDEX | `INDEX(range, row, [col])` | Returns the value at the given offset inside a range. | `=INDEX(A1:C10, 3, 2)` |
| MATCH | `MATCH(key, range, [type])` | Returns the position of key in a range. | `=MATCH(A1, B:B, 0)` |
| CHOOSE | `CHOOSE(index, val1, val2, …)` | Picks the Nth argument by index. | `=CHOOSE(A1, "Low", "Med", "High")` |
| FILTER | `FILTER(range, condition)` | Keeps rows of range where condition is true. | `=FILTER(A:C, B:B>0)` |
| SORT | `SORT(range, [col], [asc])` | Sorts a range by the given column. | `=SORT(A1:C100, 2, FALSE)` |
| UNIQUE | `UNIQUE(range)` | Returns the distinct values in a range. | `=UNIQUE(A:A)` |

## Text

| Name | Signature | What it does | Example |
|---|---|---|---|
| CONCAT | `CONCAT(text1, text2, …)` | Joins text values end-to-end. | `=CONCAT(A1, " ", B1)` |
| LEFT | `LEFT(text, [n])` | First n characters of text. | `=LEFT(A1, 3)` |
| RIGHT | `RIGHT(text, [n])` | Last n characters of text. | `=RIGHT(A1, 4)` |
| MID | `MID(text, start, length)` | Substring starting at position start. | `=MID(A1, 2, 5)` |
| LEN | `LEN(text)` | Number of characters in text. | `=LEN(A1)` |
| LOWER | `LOWER(text)` | Converts text to lowercase. | `=LOWER(A1)` |
| UPPER | `UPPER(text)` | Converts text to uppercase. | `=UPPER(A1)` |
| TRIM | `TRIM(text)` | Removes extra whitespace from text. | `=TRIM(A1)` |
| SUBSTITUTE | `SUBSTITUTE(text, find, replace, [n])` | Replaces find with replace inside text. | `=SUBSTITUTE(A1, "-", " ")` |
| FIND | `FIND(needle, text, [start])` | Position of needle inside text (case-sensitive). | `=FIND("@", A1)` |
| TEXTJOIN | `TEXTJOIN(delim, ignore_empty, range, …)` | Joins values from a range with a delimiter. | `=TEXTJOIN(", ", TRUE, A1:A10)` |

## Date & Time

| Name | Signature | What it does | Example |
|---|---|---|---|
| TODAY | `TODAY()` | Today's date (recalculates daily). | `=TODAY()` |
| NOW | `NOW()` | Current date and time. | `=NOW()` |
| DATE | `DATE(year, month, day)` | Builds a date from parts. | `=DATE(2026, 1, 15)` |
| YEAR | `YEAR(date)` | Year component of a date. | `=YEAR(A1)` |
| MONTH | `MONTH(date)` | Month component (1-12). | `=MONTH(A1)` |
| DAY | `DAY(date)` | Day-of-month component (1-31). | `=DAY(A1)` |
| WEEKDAY | `WEEKDAY(date, [type])` | Day of week as a number. | `=WEEKDAY(A1)` |
| EOMONTH | `EOMONTH(date, months)` | Last day of the month, offset by months. | `=EOMONTH(A1, 0)` |

## AI cell functions

These are unique to AiCell — they call Claude. Available when the API service is configured with `ANTHROPIC_API_KEY`.

All seven functions use a single fixed-arity HyperFormula plugin (`packages/calc/src/ai-plugin.ts`); compose with `CONCAT`, `TEXTJOIN`, etc. to bring extra context into the prompt yourself.

| Name | Signature | What it does | Returns |
|---|---|---|---|
| AI | `AI(prompt)` | Free-form Claude call. | One short string. |
| CLASSIFY | `CLASSIFY(text, labels)` | Pick the best label. `labels` is a comma / semicolon / pipe-separated list. | One label from the list. |
| EXTRACT | `EXTRACT(text, field)` | Pull one named field's value out of `text`. | The extracted value as a string. |
| SUMMARIZE | `SUMMARIZE(text)` | One-paragraph summary of `text`. | Short summary string. |
| TRANSLATE | `TRANSLATE(text, lang)` | Translate `text` into `lang` (e.g. "fr", "Spanish"). | Translated string. |
| SENTIMENT | `SENTIMENT(text)` | Sentiment of `text`. | One of `"positive"`, `"negative"`, `"neutral"`. |
| FORMULA | `FORMULA(description)` | Generate an Excel-style formula expression from a plain-English description. | A formula string like `=SUMIFS(...)` you can paste into a cell. |

Cells return the sentinel `…` while a request is in flight; on completion the registry notifies the engine and the cell recalculates with the answer. Identical formulas across cells share one fetch via the prompt-hash cache. If the API service has no `ANTHROPIC_API_KEY`, every AI cell returns `#AI_DISABLED`.
