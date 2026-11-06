# DnD for friend

เกม D&D ที่ Claude เป็น DM ใช้กติกา SRD 5.2.1 เต็มรูปแบบ เปิดทีละช่วง หน้าเว็บคำนวณกติกาทั้งหมด Claude เล่าเรื่อง เล่น NPC และเลือกท่าให้ Sub Boss / Boss

## เฟส 1 (ตอนนี้): หน้าสร้างตัวละคร

- 5 คลาส เลเวล 1–5: Fighter (Champion), Rogue (Thief), Cleric (Life), Ranger (Hunter), Wizard (Evoker)
- 9 เผ่า, 4 พื้นเพ, เวทเลเวล 0–3 จำนวน 183 เวท, อาวุธ เกราะ และของใช้
- การ์ดตัวละครเซฟในบัญชี ดาวน์โหลด/โหลดเป็นไฟล์ได้ เลเวลอัปตาม EXP
- ตัวสำเร็จรูป 5 ตัว ดู `premades.md`

## โครงสร้าง

| โฟลเดอร์ | ไว้ทำอะไร |
|---|---|
| `data/` | ข้อมูลกติกาจาก SRD เป็น JSON (classes, origins, equipment, spells, premades) |
| `engine/rules.js` | ตัวคิดกติกาตัวละคร ใช้ได้ทั้งเบราว์เซอร์และ Node |
| `tests/` | เทสอัตโนมัติ `npm test` |
| `app/src/` | โค้ดหน้าเว็บ (page.html + app.js) |
| `app/index.html` | หน้าเว็บที่รวมทุกอย่างเป็นไฟล์เดียว สร้างด้วย `npm run build` |
| `tools/` | สคริปต์ดึงข้อความจาก PDF SRD, แยกเวท, สร้างตัวสำเร็จรูป, build |
| `srd-text/` | ข้อความที่ดึงจาก SRD แยกตามหมวด |

## คำสั่ง

```
npm test                       # เทสตัวคิดกติกา
node tools/make_premades.mjs   # สร้าง data/premades.json ใหม่
npm run build                  # รวมเป็น app/index.html
```

## เฟสถัดไป

2. ตัวคิดการต่อสู้ + มอน 3 ระดับ (ปกติ / Sub Boss / Boss) และ AI มอน
3. กระดานต่อสู้แบบกริด + โทเคน
4. Claude เป็น DM (เล่าเรื่อง, NPC, ท่าของบอส)
5. แผนที่โลก/แผนที่สถานที่

## License

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
