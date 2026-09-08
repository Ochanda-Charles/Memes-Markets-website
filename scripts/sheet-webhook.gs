/**
 * The Google Apps Script behind every form on the site, and behind the careers
 * listing it reads back.
 *
 * This file is NOT part of the Next.js build. It is the code you paste into
 * Apps Script — it lives in the repo so the thing receiving your enquiries and
 * applications is version-controlled alongside the forms that send them, rather
 * than existing only inside one person's Google account.
 *
 * ONE DEPLOYMENT, THREE JOBS:
 *
 *   POST { list: "enquiries" }  -> a row on the Enquiries tab
 *   POST { list: "careers" }    -> a row on the Applications tab, and the CV
 *                                  saved as a file in a private Drive folder
 *   GET  ?list=roles            -> the Open and Closed rows of the Roles tab,
 *                                  as JSON, for /careers to render
 *
 * One script rather than two costs one thing worth naming: adding Drive means
 * the partnership path now runs under a script authorised to create Drive files.
 * It never does, but the authorisation is real. Two scripts would keep that path
 * at spreadsheet scope — and cost two /exec URLs, two secrets, four Vercel
 * variables, two deployments to keep in step, and a second setup to follow. This
 * is fifteen lines of routing you can read in one screen; that is the larger
 * bill.
 *
 * WHY THE ROLES READ IS A doGet AND NOT "PUBLISH TO THE WEB AS CSV". Publishing
 * a tab exposes the WHOLE tab at a guessable URL, so a row marked Draft would be
 * public whatever its status column said. Filtering drafts here, before
 * answering, is the only version where staging a listing is actually private.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP — about ten minutes, once.
 *
 *  1. Create a Google Sheet. `Enquiries` and `Applications` appear on their own
 *     the first time something is written to them. `Roles` does not, because it
 *     is only ever read: run `setupRolesTab` once, after step 7, and it builds
 *     the tab with the right headers and the dropdowns that stop a mistyped
 *     Status quietly hiding a listing.
 *
 *  2. Make the folder the CVs go in. Open drive.google.com and create a folder —
 *     call it `Memes & Markets — CVs`. Open it. The address bar reads
 *     drive.google.com/drive/folders/1AbC...XyZ, and THE PART AFTER `folders/`
 *     IS THE FOLDER ID. Copy it.
 *
 *  3. Right-click that folder -> Share. Add the other host by email. Leave
 *     "General access" on **Restricted**. Do NOT pick "Anyone with the link":
 *     that would publish every CV to anybody who guesses a URL.
 *
 *  4. In the Sheet: Extensions -> Apps Script. Delete the placeholder, paste
 *     this whole file.
 *
 *  5. Set SHARED_SECRET below to a long random string, and CV_FOLDER_ID to the
 *     id from step 2. If you would rather not read an id out of a URL, set it
 *     aside for a moment: run `findFolderId` after step 6 and it prints the id
 *     straight from Drive, which cannot pick up the account index or the
 *     ?usp= query the address bar carries.
 *
 *  6. AUTHORISE THE DRIVE PERMISSION. In the editor's function dropdown pick
 *     `authoriseMe`, press Run, and accept the consent screen. It creates
 *     nothing. It exists so that Google asks for the new permission at a moment
 *     you are sitting there watching, rather than failing on somebody's real
 *     application at two in the morning.
 *
 *  7. Deploy.
 *     - FIRST TIME EVER: Deploy -> New deployment -> type "Web app".
 *         Execute as:     Me
 *         Who has access: Anyone
 *       "Anyone" is required — Vercel's servers reach this without a Google
 *       login. It is why the shared secret exists; see the note on it.
 *       Copy the /exec URL.
 *     - EVERY TIME AFTER: Deploy -> **Manage deployments** -> the pencil icon on
 *       the existing deployment -> Version: New version -> Deploy. Use Manage
 *       deployments, never New deployment: the second one mints a DIFFERENT URL
 *       and the site carries on posting to the old code.
 *
 *  8. In Vercel -> Settings -> Environment Variables, for Production and
 *     Preview:
 *         SHEET_WEBHOOK = the /exec URL
 *         SHEET_SECRET  = the same string as SHARED_SECRET
 *     (The older PARTNER_SHEET_WEBHOOK / PARTNER_SHEET_SECRET names still work
 *     and can stay until somebody tidies them up. See lib/sheet.ts.) Redeploy.
 *
 *  9. Run `setupRolesTab` to build the Roles tab.
 *
 * 10. Check it: paste `<your /exec URL>?list=roles` into a browser. You should
 *     see JSON listing your roles, with any Draft row absent. An empty list is
 *     the right answer until a row has Status set to Open.
 *
 * ADDING A ROLE, once all of the above is done: fill in a row on the Roles tab,
 * set Status to Open, and it is live within five minutes. No deploy, and nobody
 * needs to touch this script again. Draft keeps a half-written listing private —
 * drafts are filtered out here, before anything leaves Google. Closed leaves the
 * page up for anyone holding the link, marked closed and out of Google's index.
 *
 * IF THINGS STOP ARRIVING AFTER YOU EDIT THIS FILE, check step 7 first and then
 * step 6. Adding a permission invalidates the previous authorisation, and a
 * deployment running unauthorised code fails on every write and says nothing.
 *
 * QUOTAS, so nobody has to guess. Six minutes per invocation on a consumer
 * account (a 2MB Drive write is one to three seconds). Ninety minutes of script
 * runtime a day — the roles read at the site's five-minute cache is about 288
 * calls a day at roughly a second each, so shortening ROLES_REVALIDATE in
 * lib/roles.ts to seconds is the thing not to do. CVs land in the SCRIPT
 * OWNER'S personal 15GB, shared with their Gmail, which is the other reason the
 * privacy page promises to delete them after twelve months.
 */

/**
 * Must match SHEET_SECRET in Vercel.
 *
 * The web app has to be reachable by "Anyone" for the site's server to post to
 * it, which means the URL alone is a write endpoint for anybody who learns it.
 * The secret is what stops a leaked URL from becoming an open spam funnel into
 * the sheet — and now into the Drive folder, which matters more. A long random
 * string is plenty.
 */
const SHARED_SECRET = "change-me-to-a-long-random-string";

/**
 * The Drive folder CVs are saved into. See step 2 above.
 *
 * NOT a Vercel environment variable: the site never touches Drive, and putting
 * this id there would imply that it does.
 */
const CV_FOLDER_ID = "paste-the-folder-id-here";

/** Extension per accepted type. Mirrors CV_TYPES in lib/careers.ts. */
const EXTENSIONS = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/**
 * The write lists. An unknown or missing `list` falls through to enquiries, so
 * a payload sent by a version of the site older than this script still lands
 * somewhere a person will see it.
 */
const LISTS = {
  enquiries: {
    sheet: "Enquiries",
    headers: ["Received", "Name", "Email", "Organisation", "About", "Message"],
    row: function (body) {
      return [
        body.receivedAt || new Date().toISOString(),
        body.name || "",
        body.email || "",
        body.organisation || "",
        body.kind || "",
        body.message || "",
      ];
    },
  },

  careers: {
    sheet: "Applications",
    headers: [
      "Received",
      "Role",
      "Role slug",
      "Name",
      "Email",
      "Based in",
      "Link",
      "Message",
      "CV",
      "Their filename",
      "Status",
    ],
    row: function (body) {
      return [
        body.receivedAt || new Date().toISOString(),
        // Labelled rather than blank. A blank cell in a column the hosts filter
        // on reads as a data bug and gets investigated; a labelled one reads as
        // a decision. The slug beside it stays empty, which is what makes the
        // two distinguishable to a filter.
        body.roleTitle || "General application",
        body.roleSlug || "",
        body.name || "",
        body.email || "",
        body.location || "",
        body.link || "",
        body.message || "",
        body.cv ? saveCv(body) : "",
        (body.cv && body.cv.name) || "",
        "New",
      ];
    },
  },
};

/* ─────────────────────────────── writes ─────────────────────────────── */

function doPost(e) {
  // Two submissions arriving together can both compute the same "next row", and
  // one silently overwrites the other. Cheap insurance on a write nobody can
  // replay: the person has already been told their application was sent.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return reply({ ok: false, error: "busy" });
  }

  try {
    const body = JSON.parse(e.postData.contents);

    if (!SHARED_SECRET || body.secret !== SHARED_SECRET) {
      return reply({ ok: false, error: "unauthorised" });
    }

    const list = LISTS[body.list] || LISTS.enquiries;
    appendSafely(getSheet(list), list.row(body));

    return reply({ ok: true });
  } catch (err) {
    // Logged as well as returned. ContentService cannot set an HTTP status, so
    // this reply reaches the site as a 200 carrying ok:false — the site reads
    // the body and tells the person it did not send, and Executions in the Apps
    // Script editor is where the actual reason is legible.
    console.error("doPost failed: " + String(err));
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Append a row as TEXT.
 *
 * A cell whose contents begin with = + - or @ is a FORMULA to Sheets, not a
 * string. Before this, a message beginning "=IMPORTRANGE(..." executed inside
 * the hosts' own spreadsheet the moment it arrived — a form on a public website
 * that runs code in a private document.
 *
 * Setting the range's number format to "@" first is the fix. The folk remedy of
 * prefixing an apostrophe is not: it is ambiguous the moment a value legitimately
 * begins with a minus sign, and it shows up in the cell when you copy it out.
 */
function appendSafely(sheet, values) {
  const row = sheet.getLastRow() + 1;
  const range = sheet.getRange(row, 1, 1, values.length);
  range.setNumberFormat("@");
  range.setValues([values]);
}

/**
 * Decode the base64 CV into a real file in Drive, and hand back its URL.
 *
 * THERE IS NO setSharing CALL HERE, AND THAT IS THE POINT. A file created inside
 * a folder inherits that folder's sharing, which step 3 left Restricted. Calling
 * setSharing(ANYONE_WITH_LINK) on a folder of CVs is how somebody's home address
 * and phone number end up in a search index.
 *
 * IT CATCHES ITS OWN FAILURES, and the reason is worth stating. This function
 * used to be allowed to throw, which aborted the whole write — so a wrong
 * CV_FOLDER_ID, or a deployment that had not been re-authorised for Drive, threw
 * away the candidate's name, address, message and link along with the file. The
 * first real application sent to this script was lost exactly that way.
 *
 * The application is worth more than the attachment. A row that lands with
 * "UPLOAD FAILED" in the CV column is a person somebody can still email; a row
 * that never lands is nobody at all.
 */
function saveCv(body) {
  try {
    const bytes = Utilities.base64Decode(body.cv.data);
    const blob = Utilities.newBlob(bytes, body.cv.type, cvName(body));
    return DriveApp.getFolderById(CV_FOLDER_ID).createFile(blob).getUrl();
  } catch (err) {
    // Executions in the Apps Script editor is where this shows up.
    console.error("saveCv failed: " + String(err));
    return "UPLOAD FAILED — ask them to email it. Reason: " + String(err);
  }
}

/**
 * The stored filename, built ENTIRELY from our own fields.
 *
 * The candidate's own filename is attacker-controlled. It goes in the row, where
 * it is text somebody reads, and never near the filesystem. Date first so the
 * folder sorts chronologically without anybody configuring it.
 *
 *   2026-09-07_associate-producer_Sam-Rivera.pdf
 */
function cvName(body) {
  const when = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
  const role = String(body.roleSlug || "general").replace(/[^A-Za-z0-9-]+/g, "");
  const who = String(body.name || "unnamed")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = EXTENSIONS[body.cv.type] || "bin";
  return when + "_" + (role || "general") + "_" + (who || "unnamed") + "." + ext;
}

/* ──────────────────────────────── read ──────────────────────────────── */

const ROLES_SHEET = "Roles";

/**
 * Sheet header -> the key lib/roles-sheet.ts reads.
 *
 * Keyed on the header TEXT, lowercased, so somebody reordering the columns in
 * Sheets cannot silently shift every field by one. Renaming a header drops that
 * field instead, which shows up immediately on the page rather than quietly
 * putting the salary in the location.
 */
const ROLE_COLUMNS = {
  slug: "slug",
  title: "title",
  team: "team",
  location: "location",
  remote: "remote",
  type: "type",
  compensation: "compensation",
  status: "status",
  posted: "posted",
  closes: "closes",
  summary: "summary",
  responsibilities: "responsibilities",
  requirements: "requirements",
  "nice to have": "niceToHave",
  process: "process",
};

/**
 * The Roles tab's header row, in order.
 *
 * Lowercased, these must be exactly the keys of ROLE_COLUMNS above — that is
 * what readRoles matches on, and lib/sheet.test.ts fails if the two drift apart.
 * A header renamed here and not there does not error; it silently drops that
 * column from every listing, which is the sort of fault that reaches the site.
 */
var ROLE_HEADERS = [
  "Slug",
  "Title",
  "Team",
  "Location",
  "Remote",
  "Type",
  "Compensation",
  "Status",
  "Posted",
  "Closes",
  "Summary",
  "Responsibilities",
  "Requirements",
  "Nice to have",
  "Process",
];

/**
 * Build the Roles tab, or bring an existing one up to date. Run it once.
 *
 * WHY THIS IS NOT AUTOMATIC. Enquiries and Applications are created on their
 * first write, because the script is holding the row that needs somewhere to
 * go. Roles is only ever READ, so there is no moment at which the script can
 * infer that a tab should exist — a missing one is indistinguishable from a
 * sheet where nobody is hiring, and both correctly render an empty page.
 *
 * IT NEVER DELETES ANYTHING. On a tab that already has rows it leaves them
 * alone and only refreshes the dropdowns, so it is safe to re-run.
 *
 * The dropdowns are the point of it. readRoles is deliberately unforgiving
 * about Status — anything it does not recognise is treated as Draft, so the
 * listing stays hidden rather than being published half-finished. That is the
 * right failure, but it means a typo costs somebody a puzzled afternoon.
 * Constraining the cell means the typo cannot be typed.
 */
function setupRolesTab() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(ROLES_SHEET);
  var created = false;

  if (!sheet) {
    sheet = book.insertSheet(ROLES_SHEET);
    created = true;
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ROLE_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, ROLE_HEADERS.length).setFontWeight("bold");

    // The four list columns hold one item per line, so the cells need to wrap
    // or the tab is unreadable the moment a real description goes in.
    var wrapped = ["Summary", "Responsibilities", "Requirements", "Nice to have", "Process"];
    for (var w = 0; w < wrapped.length; w++) {
      var col = ROLE_HEADERS.indexOf(wrapped[w]) + 1;
      sheet.getRange(2, col, sheet.getMaxRows() - 1).setWrap(true);
      sheet.setColumnWidth(col, 320);
    }
  }

  // Idempotent, and applied whether or not the tab is new: a sheet somebody
  // built by hand before this function existed gets the dropdowns too.
  applyRoleDropdown(sheet, "Remote", ["Remote", "Hybrid", "On-site"]);
  applyRoleDropdown(sheet, "Type", [
    "Full-time",
    "Part-time",
    "Contract",
    "Freelance",
    "Internship",
  ]);
  applyRoleDropdown(sheet, "Status", ["Open", "Closed", "Draft"]);

  Logger.log(created ? "Created the Roles tab." : "Roles tab already existed; left its rows alone.");
  Logger.log("Dropdowns set on Remote, Type and Status.");
  Logger.log("");
  Logger.log("To publish a role: fill in a row, set Status to Open, and the site");
  Logger.log("picks it up within five minutes. Draft hides it and never leaves Google.");
  Logger.log("Title is the only column that is genuinely required.");
}

/**
 * Constrain one column to a list, rejecting anything else.
 *
 * setAllowInvalid(false) rather than a warning triangle: a value the sheet
 * merely grumbles about is still a value readRoles will fall back to Draft on,
 * and the person who typed it has already moved on.
 */
function applyRoleDropdown(sheet, header, values) {
  var col = ROLE_HEADERS.indexOf(header) + 1;
  if (col === 0) return;

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, col, sheet.getMaxRows() - 1).setDataValidation(rule);
}

/**
 * A GET is either somebody checking the deployment is alive, or the site asking
 * for the roles. It must never branch into anything that writes.
 */
function doGet(e) {
  const list = (e && e.parameter && e.parameter.list) || "";
  if (list !== "roles") {
    return reply({ ok: true, note: "Memes & Markets form endpoint" });
  }
  try {
    return reply({ ok: true, roles: readRoles() });
  } catch (err) {
    // An empty list rather than an error: lib/roles.ts treats a valid empty
    // answer as "nothing open", which renders a correct page. A 500 would make
    // it fall back to a stale listing instead.
    return reply({ ok: true, roles: [], error: String(err) });
  }
}

function readRoles() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(ROLES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const header = values[0];

  // header text -> column index, for the columns we know about.
  const index = {};
  for (let c = 0; c < header.length; c++) {
    const key = ROLE_COLUMNS[String(header[c]).trim().toLowerCase()];
    if (key) index[key] = c;
  }

  const roles = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const role = {};
    for (const key in index) {
      role[key] = cellText(row[index[key]]);
    }

    // A blank trailing row is normal; so is a row somebody has started and not
    // finished. Neither is a listing.
    if (!role.title) continue;

    // DRAFTS NEVER LEAVE GOOGLE. This line is the whole reason this is a doGet
    // and not a published CSV. lib/roles-sheet.ts drops them again, which costs
    // one line and means a half-deployed script cannot leak one either.
    if (String(role.status).trim().toLowerCase() === "draft") continue;

    roles.push(role);
  }
  return roles;
}

/**
 * One cell to a string the site can read.
 *
 * A date cell comes back as a Date object, and String(date) is a long American
 * sentence. lib/roles-sheet.ts only accepts YYYY-MM-DD, so anything else is
 * dropped rather than printed wrong — formatting it here is what keeps real
 * dates on the page.
 */
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd");
  }
  return String(value).trim();
}

/* ─────────────────────────────── plumbing ───────────────────────────── */

function getSheet(list) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(list.sheet);
  if (!sheet) sheet = book.insertSheet(list.sheet);

  // Write the header row once, and freeze it so the sheet stays readable as it
  // fills. Checked every time because the first call may be on an empty sheet.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(list.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, list.headers.length).setFontWeight("bold");
  }
  return sheet;
}

function reply(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Print the id of every folder whose name matches, so CV_FOLDER_ID can be copied
 * out of a log rather than out of a URL.
 *
 * WHY THIS EXISTS. Reading the id out of the address bar is the documented way,
 * and it is the step that goes wrong. The URL carries an account index in the
 * middle (/drive/u/0/folders/...) and a query on the end (?usp=drive_link), and
 * both get copied along with the id. Worse, a Drive SHORTCUT to a folder has its
 * own separate id and looks identical in the address bar — getFolderById on a
 * shortcut fails with the same "No item with the given ID could be found" as a
 * plain typo, so the mistake and the misdiagnosis arrive together.
 *
 * The ids printed here come from Drive itself, so none of that can happen.
 *
 * Set NAME_CONTAINS to part of the folder name, pick findFolderId in the
 * dropdown, press Run, and read the Execution log. Running it also triggers the
 * Drive consent screen if this deployment has never been authorised, which is
 * the other half of the same problem.
 */
function findFolderId() {
  var NAME_CONTAINS = "CV";

  // Escaped for Drive's query language, not for JavaScript: an apostrophe in a
  // folder name would otherwise close the quoted term mid-query.
  var escaped = NAME_CONTAINS.replace(/'/g, "\\'");
  var found = DriveApp.searchFolders(
    "title contains '" + escaped + "' and trashed = false",
  );

  var n = 0;
  while (found.hasNext()) {
    var folder = found.next();
    n++;
    Logger.log("[" + n + "] " + folder.getName());
    Logger.log("      id:  " + folder.getId());
    Logger.log("      url: " + folder.getUrl());
  }

  if (n === 0) {
    Logger.log("No folder found with '" + NAME_CONTAINS + "' in its name.");
    Logger.log(
      "Either it does not exist yet, or it belongs to a different Google account " +
        "than the one this script runs as — check the account shown top right.",
    );
  } else {
    Logger.log("");
    Logger.log("Paste the id above into CV_FOLDER_ID, then run checkSetup.");
  }
}

/**
 * Run this from the editor when something is not arriving. It writes nothing.
 *
 * It exists because the failure it diagnoses is invisible from the outside: the
 * script catches its own exceptions and answers 200 either way, so a wrong
 * folder id or a missing Drive authorisation looks, from the sheet, like a form
 * nobody used. Select `checkSetup` in the function dropdown, press Run, and read
 * the Execution log underneath.
 */
function checkSetup() {
  const problems = [];

  if (!SHARED_SECRET || SHARED_SECRET === "change-me-to-a-long-random-string") {
    problems.push("SHARED_SECRET is still the placeholder. Set it, and set SHEET_SECRET in Vercel to the same string.");
  }

  if (!CV_FOLDER_ID || CV_FOLDER_ID === "paste-the-folder-id-here") {
    problems.push("CV_FOLDER_ID is still the placeholder. Step 2 at the top of this file says where to find it.");
  } else {
    try {
      const folder = DriveApp.getFolderById(CV_FOLDER_ID);
      Logger.log("Drive folder OK: " + folder.getName());
    } catch (err) {
      // Two very different faults with one symptom. "not found" is usually the
      // wrong id, or an id copied from a shortcut rather than the folder itself;
      // anything mentioning permission or authorisation means this deployment
      // has never been authorised for Drive, which is step 6.
      problems.push("CV_FOLDER_ID does not resolve: " + String(err));
      problems.push("If that mentions permission or authorisation, run authoriseMe and then redeploy via Manage deployments.");
    }
  }

  const book = SpreadsheetApp.getActiveSpreadsheet();
  for (const key in LISTS) {
    const name = LISTS[key].sheet;
    Logger.log("Tab " + name + ": " + (book.getSheetByName(name) ? "present" : "missing (it will be created on first write)"));
  }
  Logger.log("Tab " + ROLES_SHEET + ": " + (book.getSheetByName(ROLES_SHEET) ? "present" : "MISSING — /careers cannot list anything without it"));

  if (problems.length === 0) {
    Logger.log("");
    Logger.log(
      "No problems found. If applications are still not arriving, the deployment is " +
        "probably running an older version of this file: Deploy -> Manage deployments " +
        "-> edit -> New version.",
    );
  } else {
    Logger.log("");
    Logger.log(problems.length + " problem(s) found:");
    for (let i = 0; i < problems.length; i++) Logger.log("  " + (i + 1) + ". " + problems[i]);
  }
}

/**
 * Run this by hand from the editor after any change that touches Drive.
 *
 * It creates nothing and writes nothing. Touching DriveApp and SpreadsheetApp is
 * enough to make Google ask for both permissions, which is the entire job: it
 * moves the consent screen to a moment you are watching. See step 6.
 */
function authoriseMe() {
  DriveApp.getRootFolder().getName();
  SpreadsheetApp.getActiveSpreadsheet().getName();
  Logger.log("Authorised. Now redeploy: Deploy -> Manage deployments -> edit -> Deploy.");
}
