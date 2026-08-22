import { PrismaClient, Prisma, Role } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID, randomBytes } from 'crypto';
import argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Category definitions with JSON Schemas ──────────────────

interface CategoryDef {
  code: string;
  nameEn: string;
  nameEl: string;
  idPrefix: string;
  sortOrder: number;
  schema: Record<string, unknown>;
}

const categories: CategoryDef[] = [
  {
    code: 'books',
    nameEn: 'Books',
    nameEl: 'Βιβλία',
    idPrefix: 'BK',
    sortOrder: 1,
    schema: {
      type: 'object',
      properties: {
        author: { type: 'string', title: 'Author', titleEl: 'Συγγραφέας', autocomplete: true },
        publishers: { type: 'string', title: 'Publishers', titleEl: 'Εκδότης', autocomplete: true },
        isbn: { type: 'string', title: 'ISBN' },
        language: { type: 'string', title: 'Language', titleEl: 'Γλώσσα', autocomplete: true },
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΕΓΧΕΙΡΙΔΙΟ', 'ΒΙΒΛΙΟ', 'ΑΛΛΟ'] },
      },
    },
  },
  {
    code: 'cards',
    nameEn: 'Cards',
    nameEl: 'Κάρτες',
    idPrefix: 'CA',
    sortOrder: 2,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΚΑΡΤΑ ΓΡΑΦΙΚΩΝ', 'ΚΑΡΤΑ ΕΠΕΚΤΑΣΗΣ', 'ΚΑΡΤΑ PCMCIA', 'ΚΑΡΤΑ ΔΙΚΤΥΟΥ', 'ΚΑΡΤΑ CONTROLLER', 'ΚΑΡΤΑ MODEM', 'ΚΑΡΤΑ ΗΧΟΥ', 'ΚΑΡΤΑ ΤΗΛΕΟΡΑΣΗΣ', 'ΚΑΡΤΑ ΒΙΝΤΕΟ', 'ΚΑΡΤΑ ΡΑΔΙΟΦΩΝΟΥ', 'ΚΑΡΤΑ MODEM | ΚΑΡΤΑ PCMCIA'] },
        internalExternal: { type: 'string', title: 'Internal/External', titleEl: 'Εσωτερικό/Εξωτερικό', enum: ['INTERNAL', 'EXTERNAL'] },
      },
    },
  },
  {
    code: 'computers',
    nameEn: 'Computers',
    nameEl: 'Υπολογιστές',
    idPrefix: 'PC',
    sortOrder: 3,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΣΤΑΘΕΡΟΣ', 'ΦΟΡΗΤΟΣ', 'SERVER - CLIENT'] },
        operatingSystem: { type: 'string', title: 'Operating System', titleEl: 'Λειτουργικό Σύστημα' },
        processor: { type: 'string', title: 'Processor', titleEl: 'Επεξεργαστής' },
        ram: { type: 'string', title: 'RAM' },
        drive: { type: 'string', title: 'Drive', titleEl: 'Δίσκος' },
        opticalDrive: { type: 'string', title: 'Optical Drive', titleEl: 'Οπτικός Δίσκος' },
        operationalStatus: { type: 'string', title: 'Operational Status', titleEl: 'Κατάσταση Λειτουργίας' },
        maintainedBy: { type: 'string', title: 'Maintained by', titleEl: 'Συντήρηση από' },
        fullDescription: { type: 'string', title: 'Full Description', titleEl: 'Πλήρης Περιγραφή' },
      },
    },
  },
  {
    code: 'consoles',
    nameEn: 'Consoles',
    nameEl: 'Κονσόλες',
    idPrefix: 'CN',
    sortOrder: 4,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΣΤΑΘΕΡΗ', 'ΦΟΡΗΤΗ'] },
      },
    },
  },
  {
    code: 'devices',
    nameEn: 'Devices',
    nameEl: 'Συσκευές',
    idPrefix: 'DE',
    sortOrder: 5,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΚΙΝΗΤΟ ΤΗΛΕΦΩΝΟ', 'ΔΙΚΤΥΑΚΟ', 'GADGET', 'PALMTOP', 'CALCULATOR', 'DOCKING STATION/INTERFACE', 'ΚΑΣΕΤΟΦΩΝΟ', 'ΣΤΑΘΕΡΟ ΤΗΛΕΦΩΝΟ', 'ΦΩΤΟΓΡΑΦΙΚΗ ΜΗΧΑΝΗ', 'ΤΗΛΕΟΡΑΣΗ', 'ΓΡΑΦΟΜΗΧΑΝΗ', 'ORGANIZER', 'ΒΙΝΤΕΟ', 'ΕΞ. TV TUNER', 'ΡΑΔΙΟΦΩΝΟ', 'ΒΙΝΤΕΟΚΑΜΕΡΑ', 'SWITCH', 'MODEM', 'TABLET', 'ΤΗΛΕΧΕΙΡΙΣΤΗΡΙΟ', 'DIGITIZER', 'INTERNET PHONE', 'MODEM-ROUTER', 'MP3 PLAYER', 'UPS', 'ΠΑΛΜΟΓΡΑΦΟΣ', 'DIGITIZER | ORGANIZER', 'WALKMAN', 'ΜΕΤΑΦΡΑΣΤΗΣ', 'ΤΗΛΕΦΩΝΗΤΗΣ', 'FRANKING MACHINE', 'ΕΚΤΥΠΩΤΗΣ ΦΙΛΜ', 'ΨΗΦΙΑΚΗ ΒΙΤΡΙΝΑ'] },
      },
    },
  },
  {
    code: 'magazines',
    nameEn: 'Magazines',
    nameEl: 'Περιοδικά',
    idPrefix: 'MA',
    sortOrder: 6,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΠΕΡΙΟΔΙΚΟ', 'ΕΝΘΕΤΟ'] },
        issue: { type: 'string', title: 'Issue', titleEl: 'Τεύχος' },
        monthIssued: { type: 'string', title: 'Month Issued', titleEl: 'Μήνας Έκδοσης' },
        language: { type: 'string', title: 'Language', titleEl: 'Γλώσσα' },
        isbn: { type: 'string', title: 'ISBN' },
      },
    },
  },
  {
    code: 'motherboards',
    nameEn: 'Motherboards',
    nameEl: 'Μητρικές',
    idPrefix: 'MB',
    sortOrder: 7,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος' },
      },
    },
  },
  {
    code: 'others',
    nameEn: 'Others',
    nameEl: 'Άλλα',
    idPrefix: 'OT',
    sortOrder: 8,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος' },
      },
    },
  },
  {
    code: 'parts',
    nameEn: 'Parts',
    nameEl: 'Εξαρτήματα',
    idPrefix: 'PA',
    sortOrder: 9,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ADAPTOR/ΕΙΔΙΚΟ SWITCH', 'ΛΟΙΠΑ', 'ΛΥΧΝΙΑ', 'ΜΕΡΟΣ ΣΚΛΗΡΟΥ ΔΙΣΚΟΥ', 'ΕΞΑΡΤΗΜΑΤΑ', 'ΑΝΤΑΛΛΑΚΤΙΚΟ', 'ΜΗΧΑΝΟΓΡΑΦΙΚΟ ΧΑΡΤΙ', 'ΜΠΑΤΑΡΙΑ', 'ΠΥΚΝΩΤΕΣ'] },
      },
    },
  },
  {
    code: 'peripherals',
    nameEn: 'Peripherals',
    nameEl: 'Περιφερειακά',
    idPrefix: 'PE',
    sortOrder: 10,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΠΛΗΚΤΡΟΛΟΓΙΟ', 'ΟΘΟΝΗ', 'ΠΟΝΤΙΚΙ', 'JOYSTICK', 'ΕΚΤΥΠΩΤΗΣ', 'WEB CAMERA', 'ΗΧΕΙΑ', 'ΦΙΛΤΡΟ', 'ΣΑΡΩΤΗΣ', 'ΜΙΚΡΟΦΩΝΟ', 'GRAPHICS TABLET', 'ΠΡΟΤΖΕΚΤΟΡΑΣ', 'ΑΚΟΥΣΤΙΚΑ', 'SPEECH SYNTTESIZER', 'ΓΡΑΦΙΔΑ', 'POINTING', 'TOUCHPAD'] },
      },
    },
  },
  {
    code: 'power_supply',
    nameEn: 'Power Supply',
    nameEl: 'Τροφοδοτικά',
    idPrefix: 'PS',
    sortOrder: 11,
    schema: {
      type: 'object',
      properties: {
        volt: { type: 'string', title: 'Volt (output)', titleEl: 'Volt (έξοδος)' },
        internalExternal: { type: 'string', title: 'Internal/External', titleEl: 'Εσωτερικό/Εξωτερικό', enum: ['INTERNAL', 'EXTERNAL'] },
      },
    },
  },
  {
    code: 'processors',
    nameEn: 'Processors',
    nameEl: 'Επεξεργαστές',
    idPrefix: 'PR',
    sortOrder: 12,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος' },
        socket: { type: 'string', title: 'Socket' },
        speed: { type: 'string', title: 'Speed', titleEl: 'Ταχύτητα' },
      },
    },
  },
  {
    code: 'rams',
    nameEn: 'RAMs',
    nameEl: 'Μνήμες RAM',
    idPrefix: 'RA',
    sortOrder: 13,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', autocomplete: true, suggestions: ['SIMM 30 pin', 'DDR 2 DIMM 240 pin', 'DDR DIMM 184 pin', 'SDRAM DIMM 168 pin', 'SIMM 72 pin', 'DDR 3 DIMM  pin', 'RDRAM RIMM 184 pin', 'SDRAM SODIMM 144 pin', 'SODIMM 72 pin'] },
        capacity: { type: 'string', title: 'Capacity', titleEl: 'Χωρητικότητα' },
        internalExternal: { type: 'string', title: 'Internal/External', titleEl: 'Εσωτερικό/Εξωτερικό', enum: ['INTERNAL', 'EXTERNAL'] },
      },
    },
  },
  {
    code: 'software',
    nameEn: 'Software',
    nameEl: 'Λογισμικό',
    idPrefix: 'SW',
    sortOrder: 14,
    schema: {
      type: 'object',
      properties: {
        media: { type: 'string', title: 'Media', titleEl: 'Μέσο', suggestions: ['CD-ROM', 'ΚΑΣΕΤΑ', 'ΔΙΣΚΕΤΑ 3,5"', 'DVD-ROM', 'ΔΙΣΚΕΤΑ 5,25"', 'CARTRIDGE', 'ΔΙΣΚΕΤΑ 3"', 'BLUE-RAY', 'ΔΙΣΚΕΤΑ 8"', 'ΚΑΡΤΑ ΜΝΗΜΗΣ'] },
        system: { type: 'string', title: 'System (target platform)', titleEl: 'Σύστημα (πλατφόρμα)', suggestions: ['MICROSOFT WINDOWS', 'MS-DOS', 'DOS', 'APPLE MACINTOSH', 'PC & MAC', 'SPECTRUM', 'SINCLAIR', 'AMSTRAD', 'COMMODORE', 'AMIGA', 'ATARI', 'SONY PLAYSTATION', 'NINTENDO', 'XBOX', 'SEGA', 'ACORN', 'BBC', 'MSX', 'TEXAS INSTRUMENTS', 'CP/M', 'OS/2 WARP', 'LINUX', 'IBM', 'NEXT', 'BASIC', 'ARCADE', 'NOVELL'] },
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['VIDEO GAMES', 'PROGRAMS', 'OPERATING SYSTEMS'] },
        language: { type: 'string', title: 'Language', titleEl: 'Γλώσσα', suggestions: ['ΕΛΛΗΝΙΚΑ', 'ΑΓΓΛΙΚΑ', 'ΠΟΛΥΓΛΩΣΣΟ', 'ΓΑΛΛΙΚΑ', 'ΓΕΡΜΑΝΙΚΑ', 'ΙΤΑΛΙΚΑ', 'ΙΣΠΑΝΙΚΑ'] },
      },
    },
  },
  {
    code: 'storage',
    nameEn: 'Storage',
    nameEl: 'Αποθηκευτικά',
    idPrefix: 'ST',
    sortOrder: 15,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', title: 'Type', titleEl: 'Τύπος', enum: ['ΜΟΝΑΔΑ ΣΚΛΗΡΟΥ ΔΙΣΚΟΥ', 'ΜΟΝΑΔΑ ΕΥΚΑΜΠΤΟΥ ΔΙΣΚΟΥ', 'ΜΟΝΑΔΑ ΟΠΤΙΚΟΥ ΔΙΣΚΟΥ', 'ΜΟΝΑΔΑ ΜΑΓΝΗΤΙΚΗΣ ΤΑΙΝΙΑΣ', 'ΔΙΣΚΕΤΤΕΣ', 'ΜΟΝΑΔΑ ΑΠΟΘΗΚΕΥΣΗΣ ZIP DRIVE', 'STORAGE', 'ΚΑΡΤΕΣ ΜΝΗΜΗΣ', 'ΔΙΑΤΡΗΤΕΣ ΚΑΡΤΕΣ', 'ΜΟΝΑΔΑ ΚΑΡΤΩΝ ΜΝΗΜΗΣ', 'ΚΑΣΕΤΤΕΣ', 'ΜΑΓΝΗΤΙΚΗ ΤΑΙΝΙΑ', 'WORM DRIVE', 'ΔΙΑΤΡΗΤΕΣ ΤΑΙΝΙΕΣ'] },
        capacity: { type: 'string', title: 'Capacity', titleEl: 'Χωρητικότητα' },
        internalExternal: { type: 'string', title: 'Internal/External', titleEl: 'Εσωτερικό/Εξωτερικό', enum: ['INTERNAL', 'EXTERNAL'] },
      },
    },
  },
  {
    code: 'terminals',
    nameEn: 'Terminals',
    nameEl: 'Τερματικά',
    idPrefix: 'TE',
    sortOrder: 16,
    schema: {
      type: 'object',
      properties: {
        processor: { type: 'string', title: 'Processor', titleEl: 'Επεξεργαστής' },
        ram: { type: 'string', title: 'RAM' },
        drive: { type: 'string', title: 'Drive', titleEl: 'Δίσκος' },
      },
    },
  },
];

// ─── Default locations ───────────────────────────────────────

const locations = [
  { code: 'EXHIBITION', nameEn: 'Exhibition', nameEl: 'ΕΚΘΕΣΗ' },
  { code: 'STORAGE', nameEn: 'Storage', nameEl: 'ΑΠΟΘΗΚΕΥΣΗ' },
  { code: 'MAINTENANCE', nameEn: 'Maintenance', nameEl: 'ΣΥΝΤΗΡΗΣΗ' },
];

// ─── Seed function ───────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding MuseumOS database...\n');

  // 1. Categories
  console.log('  Categories:');
  for (const cat of categories) {
    const result = await prisma.category.upsert({
      where: { code: cat.code },
      update: {
        nameEn: cat.nameEn,
        nameEl: cat.nameEl,
        idPrefix: cat.idPrefix,
        schema: cat.schema as Prisma.InputJsonValue,
        sortOrder: cat.sortOrder,
      },
      create: {
        id: randomUUID(),
        code: cat.code,
        nameEn: cat.nameEn,
        nameEl: cat.nameEl,
        idPrefix: cat.idPrefix,
        schema: cat.schema as Prisma.InputJsonValue,
        sortOrder: cat.sortOrder,
      },
    });
    console.log(`    ✓ ${result.nameEn} (${result.idPrefix})`);
  }

  // 2. Locations
  console.log('\n  Locations:');
  for (const loc of locations) {
    const result = await prisma.location.upsert({
      where: { code: loc.code },
      update: { nameEn: loc.nameEn, nameEl: loc.nameEl },
      create: {
        id: randomUUID(),
        code: loc.code,
        nameEn: loc.nameEn,
        nameEl: loc.nameEl,
      },
    });
    console.log(`    ✓ ${result.nameEl} (${result.code})`);
  }

  // 3. Admin user.
  //
  // The password is NEVER hardcoded here — a committed hash is a published
  // credential for every deployment that runs this seed. Set SEED_ADMIN_EMAIL
  // and SEED_ADMIN_PASSWORD to choose your own; otherwise a random password is
  // generated and printed once, and it is the only time you will see it.
  const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@museumos.local';
  console.log('\n  Admin user:');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: SEED_ADMIN_EMAIL },
  });

  if (!existingAdmin) {
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');

    const admin = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: SEED_ADMIN_EMAIL,
        displayName: 'Administrator',
        passwordHash: await argon2.hash(password, {
          // Must match AuthService.hashPassword so seeded and
          // app-created hashes use identical parameters.
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        }),
        role: Role.admin,
        langPreference: 'el',
      },
    });
    console.log(`    ✓ Created admin: ${admin.email} (role: ${admin.role})`);
    if (generated) {
      console.log(`    ⚠ Generated password (shown once — save it now): ${password}`);
    }
  } else {
    console.log(`    ✓ Admin already exists: ${existingAdmin.email}`);
  }

  // 4. Apply search indexes (run full SQL file as a single statement)
  console.log('\n  Search indexes:');
  try {
    const searchSql = readFileSync(join(__dirname, 'search-indexes.sql'), 'utf-8');
    await prisma.$executeRawUnsafe(searchSql);
    console.log('    ✓ Search tsvector column and GIN indexes created');
  } catch (err) {
    console.log(`    ⚠ Search indexes may already exist or require manual setup: ${err}`);
  }

  console.log('\n✅ Seed complete!\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
