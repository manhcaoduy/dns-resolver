import * as fs from "fs";
import * as readline from "readline";

export async function processBindFile(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let origin;
  let ttl;
  let previousTtl;
  let previousName;

  let records = [];
  let recordsType = ["NS", "A", "CNAME", "MX"];
  recordsType.forEach((element) => {
    records[element] = [];
  });

  let soa = {};
  let soaLine = 0;
  let multiLineSoa = false;

  let containsTtl = false;

  for await (const line of rl) {
    if (line.length > 1) {
      let l = line.trim().replace(/\t/g, " ").replace(/\s+/g, " ");

      // check line is commented or not ?
      let commentLine = false;
      let commentIndex = l.indexOf(";");
      if (commentIndex !== -1) {
        if (commentIndex !== 0) {
          let m = l.split(";");
          l = m[0];
        } else {
          commentLine = true;
        }
      }

      if (!commentLine) {
        let splittedLine = l.split(" ");

        switch (splittedLine[0]) {
          case "$ORIGIN":
            origin = splittedLine[1];
            break;

          case "$TTL":
            ttl = splittedLine[1];
            break;

          case "$INCLUDE":
            break;

          default:
            if (splittedLine.includes("SOA")) {
              previousName = splittedLine[0];
              soa.mname = splittedLine[3];
              soa.rname = splittedLine[4];

              if (splittedLine.includes(")")) {
                soa.serial = splittedLine[6];
                soa.refresh = splittedLine[7];
                soa.retry = splittedLine[8];
                soa.expire = splittedLine[9];
                soa.title = splittedLine[10];
              } else {
                multiLineSoa = true;
                soaLine++;
              }
            }
        }

        if (multiLineSoa) {
          switch (soaLine) {
            case 2:
              soa.serial = splittedLine[0];
              break;
            case 3:
              soa.refresh = splittedLine[0];
              break;
            case 4:
              soa.retry = splittedLine[0];
              break;
            case 5:
              soa.expire = splittedLine[0];
              break;
            case 6:
              soa.ttl = splittedLine[0];
              break;
          }

          if (splittedLine.includes(")")) {
            multiLineSoa = false;
          }

          soaLine++;
        }

        recordsType.forEach((element) => {
          if (splittedLine.includes(element)) {
            let type = element;

            let rr;
            [rr, previousName, previousTtl] = processRr(
              splittedLine,
              containsTtl,
              previousTtl,
              previousName,
              origin,
              ttl,
            );

            records[type].push(rr);
          }
        });
      }
    }
  }

  return records;
}

function processRr(
  splittedLine,
  containsTtl,
  previousTtl,
  previousName,
  origin,
  ttl,
) {
  let rr = {};
  let totalLength = splittedLine.length;
  let isMx = Number(splittedLine[totalLength - 2]);
  switch (totalLength) {
    case 5:
      for (let index = 0; index < totalLength; index++) {
        const element = splittedLine[index];
        if (!element.includes(".")) {
          if (parseInt(element)) {
            if (!isMx) {
              containsTtl = true;
              previousTtl = element;
              splittedLine.splice(index, 1);
            }
            break;
          }
        }
      }

      if (!isMx) {
        previousName = splittedLine[0];
        rr.class = splittedLine[1];
        rr.type = splittedLine[2];
        rr.data = splittedLine[3];
      }

      break;

    case 4:
      for (let index = 0; index < totalLength; index++) {
        const element = splittedLine[index];
        if (!element.includes(".")) {
          if (parseInt(element)) {
            if (!isMx) {
              containsTtl = true;
              previousTtl = element;
              splittedLine.splice(index, 1);
            }
            break;
          }
        }
      }

      if (containsTtl) {
        rr.class = splittedLine[0];
        rr.type = splittedLine[1];
        rr.data = splittedLine[2];
      } else {
        if (isMx) {
          previousName = "@";
          rr.class = splittedLine[0];
          rr.type = splittedLine[1];
          rr.preference = splittedLine[2];
          rr.data = splittedLine[3];
        } else {
          previousName = splittedLine[0];
          rr.class = splittedLine[1];
          rr.type = splittedLine[2];
          rr.data = splittedLine[3];
        }
      }

      break;

    case 3:
      rr.class = splittedLine[0];
      rr.type = splittedLine[1];
      rr.data = splittedLine[2];

      break;

    case 2:
      break;

    default:
      break;
  }

  rr.name = previousName || origin;
  rr.ttl = previousTtl || ttl;

  return [rr, previousName, previousTtl];
}
