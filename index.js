// 📦 Dépendances
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 🚀 Initialisation de l'app Express
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 🌍 Connexion MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, usersCollection;

// --- Initialisation de la base de données ---
async function initDB() {
  try {
    await client.connect();
    db = client.db("CampusConnect");
    usersCollection = db.collection("user");
    profilesCollection = db.collection("profiles");
    friendsCollection = db.collection("friends");
    // tutorsCollection=db.collection("tutors");
    mesagesCollection=db.collection("messages");
    // notificationsCollection=db.collection("notifications");
    console.log("✅ Connecté à MongoDB Atlas !");
  } catch (err) {
    console.error("❌ Erreur de connexion à MongoDB :", err);
  }
}

initDB();

// --- ROUTE : Enregistrement d’un utilisateur et d'un profil vide---
app.post("/register/user", async (req, res) => {
  const { firstName, lastName, email, password, sexe } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res
      .status(400)
      .json({ message: "Tous les champs sont obligatoires" });
  }

  try {
    // Vérifie si l'utilisateur existe déjà
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email déjà utilisé" });
    }

    // Hash du mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insertion dans la base
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });
    const profil = await profilesCollection.insertOne({
      userId: new ObjectId(result.insertedId),
      firstName: firstName,
      lastName: lastName,
      sexe: sexe,
      bio: "",
      filiere: "",
      niveau: "",
      interests: [],
      isTutor: false,
      campus: "",
      photoUrl: "",
      createdAt: new Date(),
    });
    res.status(201).json({
      message: "Utilisateur enregistré avec succès ✅",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error("Erreur dans /register/user :", error);
    res.status(500).json({ message: "Erreur lors de l’enregistrement" });
  }
});

// --- ROUTE : Connexion d’un utilisateur ---
app.post("/login/user", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe requis" });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const profile = await profilesCollection.findOne({
      userId: new ObjectId(user._id),
    });

    res.status(200).json({
      message: "Connexion réussie ✅",
      profile: profile,
    });
  } catch (error) {
    console.error("Erreur dans /login/user :", error);
    res.status(500).json({ message: "Erreur lors de la connexion" });
  }
});

// --- ROUTE : Supprime complètement un utilisateur ---
app.delete("/delete/user", async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res
      .status(400)
      .json({ message: "L'ID de l'utilisateur est requis ❌" });
  }

  try {
    const objectId = new ObjectId(id);

    // --- 1️⃣ Supprimer l'utilisateur ---
    const deletedUser = await usersCollection.deleteOne({ _id: objectId });

    if (deletedUser.deletedCount === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé ❌" });
    }

    // --- 2️⃣ Supprimer son profil ---
    const deletedProfile = await profilesCollection.deleteOne({
      userId: objectId,
    });

    // --- 3️⃣ Supprimer toutes ses relations d’amis (envoyées ou reçues) ---
    const deletedFriends = await friendsCollection.deleteMany({
      $or: [{ userId: objectId }, { friendId: objectId }],
    });

    // Supprimer tous ses messages
    // const deletedMessages = await mesagesCollection.deleteMany({
    //   $or: [{ senderId: objectId }, { receiverId: objectId }],
    // });

    // --- 4️⃣ Réponse finale ---
    return res.status(200).json({
      message: "Utilisateur et ses données supprimés avec succès ✅",
      details: {
        profilSupprimé: deletedProfile.deletedCount > 0,
        amisSupprimés: deletedFriends.deletedCount,
      },
    });
  } catch (error) {
    console.error("❌ Erreur dans /delete/user :", error);
    return res
      .status(500)
      .json({
        message: "Erreur interne lors de la suppression de l’utilisateur",
      });
  }
});

// --- ROUTE : Modifie les informations d’un  utilisateur ---
app.put("/user/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({ message: "Id requis" });
  }

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.status(200).json({ message: "Utilisateur mis à jour ✅" });
  } catch (error) {
    console.error("Erreur dans PUT /user/:id :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la mise à jour de l'utilisateur" });
  }
});

// --- ROUTE : Renvoie les informations d’un profil utilisateur ---
app.get("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Id requis" });
  }

  try {
    // Récupération du profil via le userId
    const profile = await profilesCollection.findOne({
      userId: new ObjectId(id),
    });

    if (!profile) {
      return res.status(404).json({ message: "Profil non trouvé" });
    }

    res.status(200).json({
      message: "Profil trouvé ✅",
      profil: profile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération du profil" });
  }
});

// --- ROUTE : Modifie les informations d’un profil utilisateur ---
app.put("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;
  const { interests, ...updateData } = req.body;

  try {
    const updateObj = { ...updateData };

    //Permets de rajouter un élement à la liste des intérêts de l'utilsateur
    if (!interests) {
      await profilesCollection.updateOne(
        { userId: new ObjectId(id) },
        { $addToSet: { interests: { $each: interests } } }
      );
    }

    const result = await profilesCollection.updateOne(
      { userId: new ObjectId(id) },
      { $set: updateObj }
    );

    const updatedProfile = await profilesCollection.findOne({
      userId: new ObjectId(id),
    });

    res.status(200).json({
      message: `${result.modifiedCount} champs mis à jour ✅`,
      profil: updatedProfile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id (PUT) :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la mise à jour du profil" });
  }
});

// --- ROUTE : Récupére tous le profil de chaque  utilisateur ---
app.get("/profiles/user/", async (req, res) => {
  try {
    // Récupération du profil via le userId
    const profile = await profilesCollection.find().toArray();

    if (!profile || profile.lenght === 0) {
      return res.status(404).json({ message: "Profil non trouvé" });
    }

    res.status(200).json({
      message: "Profil trouvé ✅",
      profil: profile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des profil" });
  }
});

// --- ROUTE : Envoie une demande d’amis ---
app.post("/friends/user", async (req, res) => {
  const { senderId, receiverId } = req.body;

  if (!senderId || !receiverId) {
    return res
      .status(400)
      .json({ message: "Les deux identifiants sont obligatoires" });
  }

  try {
    // Vérifie si une relation existe déjà (dans un sens ou dans l'autre)
    const existing = await friendsCollection.findOne({
      $or: [
        {
          senderId: new ObjectId(senderId),
          receiverId: new ObjectId(receiverId),
        },
        {
          senderId: new ObjectId(receiverId),
          receiverId: new ObjectId(senderId),
        },
      ],
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "Une demande ou une amitié existe déjà" });
    }

    // Crée une nouvelle demande
    await friendsCollection.insertOne({
      senderId: new ObjectId(senderId),
      receiverId: new ObjectId(receiverId),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({ message: "Demande d’ami envoyée ✅" });
  } catch (error) {
    console.error("Erreur dans POST /friends/user :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de l’envoi de la demande d’ami" });
  }
});

// --- ROUTE : Récupère les amis selon un statut ---
async function getFriendsByStatus(req, res, status) {
  const { id } = req.params;

  if (!id) return res.status(400).json({ message: "Id requis" });

  try {
    const relations = await friendsCollection
      .find({
        $or: [
          { senderId: new ObjectId(id), status },
          { receiverId: new ObjectId(id), status },
        ],
      })
      .toArray();

    if (relations.length === 0) {
      return res.status(200).json({ message: "Aucun ami trouvé", amis: [] });
    }

    // Extraire les IDs des amis
    const friendIds = relations.map((r) =>
      r.senderId.toString() === id ? r.receiverId : r.senderId
    );

    const friendsProfiles = await profilesCollection
      .find({ userId: { $in: friendIds } })
      .toArray();

    res.status(200).json({
      message: "Amis trouvés ✅",
      amis: friendsProfiles,
    });
  } catch (error) {
    console.error(`Erreur dans GET /friends/${status}/user/:id :`, error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des amis" });
  }
}

// --- ROUTES regroupées ---
app.get("/friends/accepted/user/:id", (req, res) =>
  getFriendsByStatus(req, res, "accepted")
);
app.get("/friends/refused/user/:id", (req, res) =>
  getFriendsByStatus(req, res, "refused")
);
app.get("/friends/pending/user/:id", (req, res) =>
  getFriendsByStatus(req, res, "pending")
);

// --- ROUTE : Met à jour le statut d’une relation ---
app.put("/friends/user", async (req, res) => {
  const { senderId, receiverId, status } = req.body;

  if (!senderId || !receiverId || !status) {
    return res
      .status(400)
      .json({ message: "Champs manquants (senderId, receiverId, status)" });
  }

  if (!["accepted", "refused"].includes(status)) {
    return res
      .status(400)
      .json({ message: "Le statut doit être 'accepted' ou 'refused'" });
  }

  try {
    const result = await friendsCollection.updateOne(
      {
        $or: [
          {
            senderId: new ObjectId(senderId),
            receiverId: new ObjectId(receiverId),
          },
          {
            senderId: new ObjectId(receiverId),
            receiverId: new ObjectId(senderId),
          },
        ],
      },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Demande d’ami introuvable" });
    }

    res.status(200).json({
      message: `Demande ${
        status === "accepted" ? "acceptée ✅" : "refusée ❌"
      }`,
    });
  } catch (error) {
    console.error("Erreur dans PUT /friends/user :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la mise à jour de la relation" });
  }
});

// --- ROUTE : Supprime une relation d’amitié ---
app.delete("/friends/user", async (req, res) => {
  const { senderId, receiverId } = req.body;

  if (!senderId || !receiverId) {
    return res
      .status(400)
      .json({ message: "Les deux identifiants sont obligatoires" });
  }

  try {
    const result = await friendsCollection.deleteOne({
      $or: [
        {
          senderId: new ObjectId(senderId),
          receiverId: new ObjectId(receiverId),
        },
        {
          senderId: new ObjectId(receiverId),
          receiverId: new ObjectId(senderId),
        },
      ],
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Relation introuvable" });
    }
    //Supprimer tous les messages entre les deux utilisateurs
    // const deletedMessages = await mesagesCollection.deleteMany({
    //   $or: [
    //     { senderId: new ObjectId(senderId), receiverId: new ObjectId(receiverId) },
    //     { senderId: new ObjectId(receiverId), receiverId: new ObjectId(senderId) },
    //   ],
    // });
    //
    res.status(200).json({ message: "Relation et conversation supprimées ✅" });
  } catch (error) {
    console.error("Erreur dans DELETE /friends/user :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la suppression de l’amitié" });
  }
});

// 🔌 Fermer proprement la connexion MongoDB si le serveur s'arrête
process.on("SIGINT", async () => {
  await client.close();
  console.log("🔌 Connexion MongoDB fermée");
  process.exit(0);
});

// 🚀 Lancement du serveur
app.listen(PORT, () =>
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`)
);
