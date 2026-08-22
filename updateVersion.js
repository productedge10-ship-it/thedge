import fs from 'fs';
import readline from 'readline';

// Шлях до нашого файлу з версією
const versionPath = './src/version.json';

// Якщо файлу ще немає, створимо його
if (!fs.existsSync(versionPath)) {
    fs.writeFileSync(versionPath, JSON.stringify({ version: "1.0 - beta" }, null, 2));
}

// Читаємо поточну версію
const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const currentVersion = data.version;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Задаємо питання в консолі
rl.question(`\n📦 Поточна версія: \x1b[36m${currentVersion}\x1b[0m\nВведіть нове значення, напишіть "+1" (для автозбільшення), або натисніть Enter, щоб пропустити: `, (answer) => {
    const input = answer.trim();
    let newVersion = currentVersion;

    if (input === "+1") {
        // Розумне збільшення: шукаємо формат "Число.Число" і можливий текст після нього
        const match = currentVersion.match(/^(\d+)\.(\d+)(.*)$/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            const suffix = match[3]; // Наприклад " - beta"
            newVersion = `${major}.${minor + 1}${suffix}`;
        } else {
            console.log('⚠️ Формат не розпізнано для "+1". Будь ласка, введіть версію вручну.');
        }
    } else if (input !== '') {
        // Якщо ввели будь-який свій текст (наприклад "2.0 stable" чи "1.9")
        newVersion = input;
    }

    // Зберігаємо, якщо версія змінилась
    if (newVersion !== currentVersion) {
        fs.writeFileSync(versionPath, JSON.stringify({ version: newVersion }, null, 2));
        console.log(`✅ Версію оновлено до: \x1b[32m${newVersion}\x1b[0m\n`);
    } else {
        console.log(`⏩ Версію залишено без змін: \x1b[33m${currentVersion}\x1b[0m\n`);
    }

    rl.close();
});