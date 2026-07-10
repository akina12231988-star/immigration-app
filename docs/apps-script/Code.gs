/**
 * 入管申請管理システム - Google Apps Script Web App
 *
 * Google Cloudのプロジェクト作成・請求設定なしで、Googleスプレッドシートへの
 * 読み書きとGoogle Driveへの画像保存を行うためのバックエンド。
 * 「拡張機能 > Apps Script」からこのファイルの中身を貼り付けて、
 * 「デプロイ > 新しいデプロイ > ウェブアプリ」として公開して使う。
 *
 * このスクリプトが動くGoogleアカウント自身の権限で読み書きするため、
 * サービスアカウントや秘密鍵の発行は一切不要。
 */

// ここは必ず自分だけが知っているランダムな文字列に変更してください。
// Next.js側の環境変数 GAS_SECRET と同じ値にする必要があります。
const SECRET = "CHANGE_ME_TO_A_RANDOM_STRING";

const SHEET_NAME = "申請管理台帳";
const DRIVE_ROOT_FOLDER_NAME = "入管申請_受付票画像";

// スプレッドシートの列順（A列から）。この配列の順序が実際のセルの並びと
// JSON側のプロパティ名の対応関係を決める（並び順は変更しないこと）。
const COLUMNS = [
  "id",
  "name",
  "applicationDate",
  "applicationNumber",
  "applicationContent",
  "applicationMethod",
  "emailLink",
  "emailBody",
  "receiptImageUrl",
  "noticeImageUrl",
  "residenceCardImageUrl",
  "approvalDate",
  "lineReported",
  "notionSynced",
  "approved",
  "status",
  "assignee",
  "createdAt",
  "updatedAt",
  "notionPageId",
];

// スプレッドシートの1行目（ヘッダー）に表示する日本語ラベル。
// COLUMNSと同じ並び順にすること。
const COLUMN_LABELS = [
  "ID",
  "氏名",
  "申請日",
  "申請番号",
  "申請内容",
  "申請方法",
  "メールリンク",
  "メール本文",
  "受付票画像URL",
  "通知書画像URL",
  "在留カード画像URL",
  "許可日",
  "LINE報告済",
  "Notion同期済",
  "許可済",
  "ステータス",
  "担当者",
  "登録日時",
  "更新日時",
  "Notion Page ID",
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMN_LABELS);
  } else {
    // 既存シートでも常にヘッダーを日本語ラベルへ揃える
    sheet.getRange(1, 1, 1, COLUMN_LABELS.length).setValues([COLUMN_LABELS]);
  }
  // 申請日等の "YYYY-MM-DD" 文字列をスプレッドシートが自動で日付型に変換し、
  // タイムゾーンの都合で1日ずれてしまう問題を防ぐため、データ範囲を
  // プレーンテキスト形式に固定する。
  const numRows = Math.max(sheet.getMaxRows(), 1000);
  sheet.getRange(1, 1, numRows, COLUMNS.length).setNumberFormat("@");
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function rowToObject_(row) {
  const obj = {};
  COLUMNS.forEach((key, i) => {
    let v = row[i];
    if (key === "lineReported" || key === "notionSynced" || key === "approved") {
      v = v === true || v === "TRUE" || v === "true";
    }
    obj[key] = v === undefined || v === null ? "" : v;
  });
  return obj;
}

function objectToRow_(obj) {
  return COLUMNS.map((key) => (obj[key] === undefined ? "" : obj[key]));
}

function findRowIndexById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1; // 1-indexed, +1 for header row already accounted since i starts at 1(row2)
    }
  }
  return -1;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return jsonResponse_({ ok: false, error: "unauthorized" });
    }

    const action = body.action;
    const sheet = getSheet_();

    if (action === "list") {
      const data = sheet.getDataRange().getValues();
      const rows = data.slice(1).map(rowToObject_);
      return jsonResponse_({ ok: true, applications: rows });
    }

    if (action === "upsert") {
      const app = body.application;
      const rowIndex = findRowIndexById_(sheet, app.id);
      const rowValues = objectToRow_(app);
      if (rowIndex === -1) {
        sheet.appendRow(rowValues);
      } else {
        sheet.getRange(rowIndex, 1, 1, COLUMNS.length).setValues([rowValues]);
      }
      return jsonResponse_({ ok: true });
    }

    if (action === "delete") {
      const rowIndex = findRowIndexById_(sheet, body.id);
      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex);
      }
      return jsonResponse_({ ok: true });
    }

    if (action === "uploadImage") {
      // body.filename, body.mimeType, body.base64Data, body.folderName(任意)
      const folder = getOrCreateFolder_(body.folderName || "");
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.base64Data),
        body.mimeType,
        body.filename
      );
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonResponse_({ ok: true, url: file.getUrl(), fileId: file.getId() });
    }

    return jsonResponse_({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function getOrCreateFolder_(subFolderName) {
  const root = getOrCreateFolderByName_(DriveApp.getRootFolder(), DRIVE_ROOT_FOLDER_NAME);
  if (!subFolderName) return root;
  return getOrCreateFolderByName_(root, subFolderName);
}

function getOrCreateFolderByName_(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

// ブラウザで直接ウェブアプリURLを開いたときの疎通確認用
function doGet() {
  return jsonResponse_({ ok: true, message: "入管申請管理システム GAS API is running" });
}
