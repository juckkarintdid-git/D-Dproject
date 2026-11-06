# DnD for friend

เกม D&D ที่ Claude เป็น DM ใช้กติกา SRD 5.2.1 เต็มรูปแบบ เปิดทีละช่วง หน้าเว็บคำนวณกติกาทั้งหมด Claude เล่าเรื่อง เล่น NPC และเลือกท่าให้ Sub Boss / Boss

## มีอะไรบ้าง

- **สร้างตัวละคร**: 5 คลาส เลเวล 1–5, 9 เผ่า, 4 พื้นเพ, เวท 183 เวท, ตัวสำเร็จรูป 5 ตัว (`premades.md`) และ template ให้เพื่อนคิดตัวละครกับ AI ของตัวเอง (`character-template.md`)
- **ห้องเล่นออนไลน์**: เพื่อนเปิดลิงก์เดียวกัน เข้าห้อง เลือกการ์ดของตัวเอง เข้า-ออกได้ตลอด host เป็นเครื่องที่ให้ DM และมอนคิด ถ้า host ไม่อยู่ คนอื่นกด “เป็น host แทน”
- **แคมเปญ Ember Vale** (`data/campaign.json`): หมู่บ้าน Brindlemoor (โรงเตี๊ยม, วิหารชุบชีวิต, ตลาด, กระดานประกาศ) + ดันเจี้ยน 4 แห่ง + บอสสุดท้ายมังกรแดง
- **กระดานต่อสู้กริด 5 ฟุต**: Initiative, เดินตามเส้นทาง, Opportunity Attack, อาวุธ + Weapon Mastery, เวท 45 เวทที่คิดผลอัตโนมัติ, Dash/Dodge/Disengage/Help, Second Wind, Action Surge, ยา, Death Save
- **มอนสเตอร์ SRD 269 ตัว** (CR ≤ 8) 3 ระดับ: ปกติ (โค้ดคิดเอง), Sub Boss และ Boss (โค้ดทำเมนูท่า Claude เลือกและพูด) บอสมี Legendary Action, Phase 2, Legendary Resistance
- **หมอกแผนที่** เปิดตามที่ทีมมองเห็น, หีบสมบัติ, เบาะแส, EXP แบ่งกันหลังชนะ, ตายแล้วไปชุบที่วิหาร
- **Claude เป็น DM**: เล่าเรื่อง ขอทอยทักษะ (หน้าเว็บทอยให้) ให้รางวัล เริ่มการต่อสู้ อ่านออกเสียงภาษาไทยได้
- **โหมดทีวี** สำหรับเปิดจอใหญ่ และ **ตั้งค่า Map** (วาดกำแพง วางมอน อัปโหลดรูปพื้นหลัง นำเข้าโทเคน)
- **gen-images.html**: หน้าสร้างรูปตัวละคร โทเคน แผนที่โลก และแผนที่ต่อสู้ด้วย Gemini (ใช้แอป Gemini ฟรี หรือ API)

## โครงสร้าง

| โฟลเดอร์ | ไว้ทำอะไร |
|---|---|
| `data/` | ข้อมูลจาก SRD เป็น JSON (classes, origins, equipment, spells, monsters, premades) และแคมเปญ |
| `engine/rules.js` | ตัวคิดกติกาตัวละคร |
| `engine/combat.js` | ตัวคิดการต่อสู้: ทอยเต๋า กริด เส้นสายตา โจมตี เวท สภาพ เทิร์น |
| `engine/ai.js` | AI มอนสเตอร์ และเมนูท่าของ Sub Boss / Boss |
| `tests/` | เทสอัตโนมัติ `npm test` |
| `app/src/` | โค้ดหน้าเว็บ: page.html, app.js (สร้างตัวละคร), play.js (ห้อง ออนไลน์ DM), play-ui.js (กระดาน หมู่บ้าน แผนที่) |
| `app/index.html` | หน้าเว็บรวมเป็นไฟล์เดียว สร้างด้วย `npm run build` |
| `tools/` | สคริปต์ดึงข้อความจาก PDF SRD, แยกมอน, สร้างแคมเปญ, สร้างหน้า gen ภาพ, build |

## คำสั่ง

```
npm test                          # เทสตัวคิดกติกาและการต่อสู้
node tools/make_campaign.mjs      # สร้างและตรวจ data/campaign.json
node tools/make_gen_images.mjs    # สร้าง gen-images.html
npm run build                     # รวมเป็น app/index.html
```

## License

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
