const bcrypt = require("bcryptjs");
const { PrismaClient, Role } = require("@prisma/client");

const prisma = new PrismaClient();

const randomPrice = (min = 250, max = 3000) => {
  const steps = Math.floor((max - min) / 50);
  return min + Math.floor(Math.random() * (steps + 1)) * 50;
};

async function main() {
  const hashed = await bcrypt.hash("password123", 10);

  const doctor = await prisma.user.upsert({
    where: { email: "doctor@lab.com" },
    update: {},
    create: {
      name: "Dr. Demo",
      email: "doctor@lab.com",
      role: Role.DOCTOR,
      password: hashed
    }
  });

  await prisma.user.upsert({
    where: { email: "tech@lab.com" },
    update: {},
    create: {
      name: "Lab Tech",
      email: "tech@lab.com",
      role: Role.TECHNICIAN,
      password: hashed
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@lab.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@lab.com",
      role: Role.ADMIN,
      password: hashed
    }
  });

  const testNames = [
    "CBC",
    "ESR",
    "CRP",
    "Blood Sugar Fasting",
    "Blood Sugar PP",
    "HbA1c",
    "Lipid Profile",
    "Liver Function Test",
    "Kidney Function Test",
    "Serum Creatinine",
    "Urea",
    "Uric Acid",
    "Electrolytes",
    "Calcium",
    "Vitamin D",
    "Vitamin B12",
    "Iron Profile",
    "Ferritin",
    "Thyroid Profile",
    "TSH",
    "T3",
    "T4",
    "Dengue NS1",
    "Dengue IgG IgM",
    "Malaria Parasite",
    "Typhoid IgM",
    "Widal Test",
    "Urine Routine",
    "Urine Culture",
    "Stool Routine",
    "Stool Culture",
    "PT INR",
    "APTT",
    "D-Dimer",
    "Troponin I",
    "CK MB",
    "HIV 1 and 2",
    "HBsAg",
    "HCV",
    "VDRL",
    "Blood Group",
    "Pregnancy Test Beta hCG",
    "PSA",
    "CA 125",
    "Semen Analysis",
    "Amylase",
    "Lipase",
    "Prolactin",
    "Cortisol",
    "ANA Profile"
  ];

  const tests = testNames.map((name) => ({
    name,
    price: randomPrice()
  }));

  for (const test of tests) {
    await prisma.test.upsert({
      where: { name: test.name },
      update: { price: test.price },
      create: test
    });
  }

  const [cbc, thyroid] = await Promise.all([
    prisma.test.findUnique({ where: { name: "CBC" } }),
    prisma.test.findUnique({ where: { name: "Thyroid Profile" } })
  ]);

  if (cbc && thyroid) {
    const patient =
      (await prisma.patient.findFirst({ where: { phone: "9800000000" } })) ??
      (await prisma.patient.create({
        data: {
          name: "John Sample",
          phone: "9800000000",
          age: 32,
          gender: "Male",
          createdById: doctor.id
        }
      }));

    const order =
      (await prisma.order.findFirst({
        where: { patientId: patient.id, doctorId: doctor.id, isDeleted: false }
      })) ??
      (await prisma.order.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          status: "COMPLETED",
          sampleStatus: "RECEIVED",
          orderTests: {
            create: [
              { testId: cbc.id, unitPrice: cbc.price },
              { testId: thyroid.id, unitPrice: thyroid.price }
            ]
          }
        }
      }));

    const existingPayment = await prisma.payment.findFirst({ where: { orderId: order.id, isDeleted: false } });
    if (!existingPayment) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: Number(cbc.price) + Number(thyroid.price),
          status: "PAID",
          method: "CASH"
        }
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
