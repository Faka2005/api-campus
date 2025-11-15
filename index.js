// server.ts (remplace ton fichier actuel)
// 📦 Dépendances principales
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcrypt";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
dotenv.config();

// 🚀 Initialisation Express
const app = express();
export const PORT = process.env.PORT || 5000;

// ⚙️ Middlewares globaux
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 🌍 Connexion MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
serverApi: {
version: ServerApiVersion.v1,
strict: true,
deprecationErrors: true,
},
});

export let db,
usersCollection,
profilesCollection,
friendsCollection,
signalementCollection,
messagesCollection;

export const dbReady = (async function initDB() {
try {
await client.connect();
db = client.db("CampusConnect");
usersCollection = db.collection("user");
profilesCollection = db.collection("profiles");
friendsCollection = db.collection("friends");
signalementCollection = db.collection("signalements");
messagesCollection = db.collection("messages");
console.log("✅ MongoDB connecté");
} catch (err) {
console.error("❌ Erreur de connexion à MongoDB :", err);
}
})();

// --- Multer configuration ---
const upload = multer({
storage: multer.diskStorage({
destination: (req, file, cb) => cb(null, "uploads/"),
filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
}),
limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// =========================
// ⚡ HTTP + Socket.io (créés tôt pour être disponibles dans les routes)
// =========================
const httpServer = createServer(app);
export const io = new Server(httpServer, {
cors: {
origin: "http://localhost:5173",
methods: ["GET", "POST"],
credentials: true,
},
});

// Helper: convertit un document message Mongo en objet sérialisable côté client
function serializeMessage(doc) {
return {
_id: doc._id?.toString?.() ?? null,
senderId: doc.senderId?.toString?.() ?? null,
receiverId: doc.receiverId?.toString?.() ?? null,
content: doc.content ?? "",
timestamp: (doc.createdAt ?? doc.timestamp)?.toISOString?.() ?? null,
};
}

// =========================
// 🚹 UTILISATEURS
// =========================
app.post("/register/user", async (req, res) => {
const { firstName, lastName, email, password, sexe } = req.body;
if (!firstName || !lastName || !email || !password || !sexe)
return res.status(400).json({ message: "Tous les champs sont obligatoires" });

try {
const existingUser = await usersCollection.findOne({ email });
if (existingUser)
return res.status(400).json({ message: "Email déjà utilisé" });

const hashedPassword = await bcrypt.hash(password, 10);
const result = await usersCollection.insertOne({
email,
password: hashedPassword,
createdAt: new Date(),
});

await profilesCollection.insertOne({
userId: result.insertedId,
firstName,
lastName,
sexe,
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
userId: result.insertedId.toString(),
});
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de l’enregistrement" });
}
});

app.post("/login/user", async (req, res) => {
const { email, password } = req.body;
if (!email || !password)
return res.status(400).json({ message: "Email et mot de passe requis" });

try {
const user = await usersCollection.findOne({ email });
if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

const passwordMatch = await bcrypt.compare(password, user.password);
if (!passwordMatch)
return res.status(401).json({ message: "Mot de passe incorrect" });

const profile = await profilesCollection.findOne({ userId: user._id });
// sérialiser l'id
if (profile) profile.userId = profile.userId?.toString?.() ?? profile.userId;
res.status(200).json({ message: "Connexion réussie ✅", profile });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de la connexion" });
}
});

app.put("/user/:id", async (req, res) => {
const { id } = req.params;
const updateData = req.body;
try {
const result = await usersCollection.updateOne(
{ _id: new ObjectId(id) },
{ $set: updateData }
);
if (result.matchedCount === 0)
return res.status(404).json({ message: "Utilisateur non trouvé" });
res.status(200).json({ message: "Utilisateur mis à jour ✅" });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de la mise à jour" });
}
});

app.delete("/delete/user/:id", async (req, res) => {
const { id } = req.params;
try {
const objectId = new ObjectId(id);
const deletedUser = await usersCollection.deleteOne({ _id: objectId });
if (deletedUser.deletedCount === 0)
return res.status(404).json({ message: "Utilisateur non trouvé" });

await profilesCollection.deleteOne({ userId: objectId });
await friendsCollection.deleteMany({
$or: [{ userId: objectId }, { friendId: objectId }],
});
await messagesCollection.deleteMany({
$or: [{ senderId: objectId }, { receiverId: objectId }],
});

res.status(200).json({
message: "Utilisateur et ses données supprimés ✅",
});
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de la suppression" });
}
});

// =========================
// 🧑 PROFILS
// =========================
app.get("/profiles/user/:id", async (req, res) => {
try {
const profile = await profilesCollection.findOne({
userId: new ObjectId(req.params.id),
});
if (!profile) return res.status(404).json({ message: "Profil non trouvé" });
// sérialiser userId
profile.userId = profile.userId?.toString?.() ?? profile.userId;
res.json({ message: "Profil trouvé ✅", profil: profile });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur serveur" });
}
});

app.put("/profiles/user/:id", async (req, res) => {
const { interests, ...updateData } = req.body;
try {
if (interests) {
await profilesCollection.updateOne(
{ userId: new ObjectId(req.params.id) },
{ $addToSet: { interests: { $each: interests } } }
);
}
const result = await profilesCollection.updateOne(
{ userId: new ObjectId(req.params.id) },
{ $set: updateData }
);
const updated = await profilesCollection.findOne({
userId: new ObjectId(req.params.id),
});
if (updated) updated.userId = updated.userId?.toString?.() ?? updated.userId;
res.json({ message: `${result.modifiedCount} champs modifiés ✅`, profil: updated });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur mise à jour profil" });
}
});

app.get("/profiles/users", async (req, res) => {
try {
const profils = await profilesCollection.find({}).toArray();
// sérialiser userId pour chaque profil
const serialized = profils.map((p) => ({ ...p, userId: p.userId?.toString?.() ?? p.userId }));
res.json({ message: "Profils récupérés ✅", profils: serialized });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur serveur lors de la récupération des profils" });
}
});

// =========================
// 👥 AMIS
// =========================

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

// sérialiser userIds
const serialized = friendsProfiles.map((p) => ({ ...p, userId: p.userId?.toString?.() ?? p.userId }));

res.status(200).json({
message: "Amis trouvés ✅",
amis: serialized,
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

// Supprimer tous les messages entre les deux utilisateurs
const deletedMessages = await messagesCollection.deleteMany({
$or: [
{ senderId: new ObjectId(senderId), receiverId: new ObjectId(receiverId) },
{ senderId: new ObjectId(receiverId), receiverId: new ObjectId(senderId) },
],
});

res.status(200).json({ message: "Relation et conversation supprimées ✅", deletedMessagesCount: deletedMessages.deletedCount });
} catch (error) {
console.error("Erreur dans DELETE /friends/user :", error);
res
.status(500)
.json({ message: "Erreur lors de la suppression de l’amitié" });
}
});

// =========================
// 💬 MESSAGES
// =========================
app.get("/messages/conversation/:senderId/:receiverId", async (req, res) => {
const { senderId, receiverId } = req.params;
try {
const messages = await messagesCollection
.find({
$or: [
{ senderId: new ObjectId(senderId), receiverId: new ObjectId(receiverId) },
{ senderId: new ObjectId(receiverId), receiverId: new ObjectId(senderId) },
],
})
.sort({ createdAt: 1 })
.toArray();

const serialized = messages.map(serializeMessage);
res.json({ message: "Messages récupérés ✅", messages: serialized });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur récupération messages" });
}
});

/**
* 🔹 Récupérer les messages entre deux utilisateurs
*/
app.get("/conversation/:userId1/:userId2", async (req, res) => {
const { userId1, userId2 } = req.params;
try {
const messages = await messagesCollection
.find({
$or: [
{ senderId: new ObjectId(userId1), receiverId: new ObjectId(userId2) },
{ senderId: new ObjectId(userId2), receiverId: new ObjectId(userId1) },
],
})
.sort({ createdAt: 1 })
.toArray();

const serialized = messages.map(serializeMessage);
res.json({ message: "Messages récupérés ✅", messages: serialized });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur récupération messages" });
}
});

/**
* 🔹 Envoyer un message
*/
app.post("/send", async (req, res) => {
const { senderId, receiverId, content } = req.body;

if (!senderId || !receiverId || !content) {
return res.status(400).json({ message: "Paramètres manquants" });
}

try {
const newMessage = {
senderId: new ObjectId(senderId),
receiverId: new ObjectId(receiverId),
content,
createdAt: new Date(),
};

const result = await messagesCollection.insertOne(newMessage);

// 🔹 Émettre via Socket.IO -> informer le sender et le receiver dans leurs rooms
const payload = {
_id: result.insertedId.toString(),
senderId: senderId.toString(),
receiverId: receiverId.toString(),
content,
timestamp: newMessage.createdAt.toISOString(),
};

// émettre vers les deux rooms (si les deux utilisateurs ont joint leurs rooms)
io.to(receiverId.toString()).to(senderId.toString()).emit("receive_message", payload);

res.json({ message: "Message envoyé ✅", newMessage: payload });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de l’envoi du message" });
}
});

/**
* 🔹 Modifier un message
*/
app.put("/edit/:messageId", async (req, res) => {
const { messageId } = req.params;
const { content } = req.body;

if (!content) return res.status(400).json({ message: "Contenu manquant" });

try {
const result = await messagesCollection.updateOne(
{ _id: new ObjectId(messageId) },
{ $set: { content } }
);

if (result.modifiedCount === 0) {
return res.status(404).json({ message: "Message introuvable ou inchangé" });
}

// Optionnel : émettre un événement "message_edited" si tu veux notifier clients
const updated = await messagesCollection.findOne({ _id: new ObjectId(messageId) });
const payload = serializeMessage(updated);
io.to(payload.receiverId).to(payload.senderId).emit("message_edited", payload);

res.json({ message: "Message modifié ✅" });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur lors de la modification du message" });
}
});

// =========================
// 🚨 SIGNALEMENTS
// =========================
app.post("/signalement", async (req, res) => {
const { reporterId, reportedId, reason } = req.body;
if (!reporterId || !reportedId || !reason)
return res.status(400).json({ message: "Champs requis manquants" });
try {
await signalementCollection.insertOne({
reporterId,
reportedId,
reason,
createdAt: new Date(),
});
res.status(201).json({ message: "Signalement enregistré ✅" });
} catch (error) {
console.error(error);
res.status(500).json({ message: "Erreur signalement" });
}
});

// =========================
// ⚡ SOCKET.IO - gestion des connexions
// =========================
io.on("connection", (socket) => {
console.log("Client connecté", socket.id);

// Rejoindre les rooms : chat + notifications
socket.on("join_notifications", (userId) => {
socket.join(userId);
console.log(`Utilisateur ${userId} rejoint sa room notifications`);
});

socket.on("join_chat", (userId) => {
socket.join(userId);
console.log(`Utilisateur ${userId} rejoint sa room chat`);
});

// ⚡ Gestion messages depuis le client via socket
socket.on("send_message", async (data) => {
try {
// stocker en DB (comme dans la route POST /send)
const msgDoc = {
senderId: new ObjectId(data.senderId),
receiverId: new ObjectId(data.receiverId),
content: data.content,
createdAt: new Date(),
};
const r = await messagesCollection.insertOne(msgDoc);

const payload = {
_id: r.insertedId.toString(),
senderId: data.senderId.toString(),
receiverId: data.receiverId.toString(),
content: data.content,
timestamp: msgDoc.createdAt.toISOString(),
};

// émettre vers les deux rooms (receiver et sender)
io.to(payload.receiverId).to(payload.senderId).emit("receive_message", payload);
} catch (err) {
console.error("Erreur dans socket send_message :", err);
}
});

// ⚡ Gestion notifications de demande d'ami via socket
socket.on("send_friend_request", async (data) => {
const { senderId, receiverId } = data;

try {
const existing = await friendsCollection.findOne({
$or: [
{ senderId: new ObjectId(senderId), receiverId: new ObjectId(receiverId) },
{ senderId: new ObjectId(receiverId), receiverId: new ObjectId(senderId) },
],
});

if (!existing) {
const request = {
senderId: new ObjectId(senderId),
receiverId: new ObjectId(receiverId),
status: "pending",
createdAt: new Date(),
updatedAt: new Date(),
};
await friendsCollection.insertOne(request);

// Notification ciblée
io.to(receiverId.toString()).emit("friend_request_received", {
senderId,
message: "Vous avez reçu une nouvelle demande d'ami !",
});
}
} catch (err) {
console.error("Erreur dans socket send_friend_request :", err);
}
});

socket.on("disconnect", () => console.log("Client déconnecté", socket.id));
});

// =========================
// 📤 UPLOAD PHOTO ET RENOMMAGE
// =========================
app.post("/upload", upload.single("file"), async (req, res) => {
try {
const { userId } = req.body;
if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu" });
if (!userId) return res.status(400).json({ message: "userId manquant" });

// 🔹 Récupérer le profil de l'utilisateur
const profile = await profilesCollection.findOne({ userId: new ObjectId(userId) });
if (!profile) return res.status(404).json({ message: "Utilisateur non trouvé" });

// 🔹 Construire un nouveau nom de fichier basé sur le firstName
const ext = path.extname(req.file.originalname); // récupérer l'extension
const newFileName = `${profile.firstName}-${Date.now()}${ext}`;
const newPath = path.join(process.cwd(), "uploads", newFileName);

// 🔹 Renommer le fichier dans le dossier uploads
const fs = await import("fs/promises");
await fs.rename(req.file.path, newPath);

// 🔹 Mettre à jour MongoDB avec le nouveau nom
await profilesCollection.updateOne(
{ userId: new ObjectId(userId) },
{ $set: { photoUrl: newFileName } }
);

return res.status(200).json({
success: true,
message: "Photo uploadée et renommée ✅",
fileUrl: `/file/${userId}`, // on renverra via GET /file/:userId
});
} catch (error) {
console.error("Erreur upload :", error);
return res.status(500).json({ message: "Erreur serveur" });
}
});

// =========================
// 📥 RÉCUPÉRER LA PHOTO PAR USERID
// =========================
app.get("/file/:userId", async (req, res) => {
try {
const { userId } = req.params;

// 🔹 Récupérer le nom de fichier depuis MongoDB
const profile = await profilesCollection.findOne({ userId: new ObjectId(userId) });
if (!profile || !profile.photoUrl) return res.status(404).json({ message: "Fichier introuvable" });

const filePath = path.join(process.cwd(), "uploads", profile.photoUrl);

res.sendFile(filePath, (err) => {
if (err) {
console.error("Erreur lors de l’envoi du fichier :", err);
return res.status(404).json({ message: "Fichier introuvable" });
}
});
} catch (error) {
console.error(error);
return res.status(500).json({ message: "Erreur serveur" });
}
});

// 🔌 Fermeture MongoDB propre
process.on("SIGINT", async () => {
try {
await client.close();
console.log("🔌 Connexion MongoDB fermée");
process.exit(0);
} catch (err) {
console.error("Erreur lors de la fermeture MongoDB :", err);
process.exit(1);
}
});

export default httpServer;