const fastify = require("fastify")();

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");

require("dotenv").config();

initializeApp({
  credential: cert(require("./pleadingface-66a7d-e00f9536c168.json"))
});

const db = getFirestore();

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const DOMAIN = process.env.NODE_ENV == "development" ? "localhost" : process.env.DOMAIN;
const JWT_ISS = "pleading_face";
const PORT = process.env.NODE_ENV == "development" ? 3000 : 80;

if (JWT_PRIVATE_KEY == undefined) {
  throw Error("JWT_PRIVATE_KEY environment variable not set.");
}

if (DOMAIN == undefined) {
  throw Error("DOMAIN environment variable not set.");
}

fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
  root: path.join(__dirname, "views"), // Points to `./views` relative to the current file
  layout: "./layouts/layout", // Sets the layout to use to `./views/layouts/layout.handlebars` relative to the current file.
  viewExt: "handlebars", // Sets the default extension to `.handlebars`
  propertyName: "render", // The template can now be rendered via `reply.render()` and `fastify.render()`
  defaultContext: {
    dev: process.env.NODE_ENV === "development", // Inside your templates, `dev` will be `true` if the expression evaluates to true
  },
  options: {}, // No options passed to handlebars
});

fastify.register(require('@fastify/formbody'))

fastify.register(require('@fastify/cookie'), {
  secret: "my-secret", // for cookies signature
  hook: 'onRequest', // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
  parseOptions: {}  // options for parsing cookies
})

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/', // optional: default '/'
  constraints: {} // optional: default {}
})

function getUserNameFromJwt(tokenStr) {
  if (tokenStr == undefined || tokenStr == "") {
    return undefined;
  }

  let token = jwt.verify(tokenStr, JWT_PRIVATE_KEY);
  
  if (token.iss != JWT_ISS) {
    return undefined;
  }

  if (token.sub == undefined) {
    return undefined;
  }

  return token.sub;
}

async function getUserFromJwt(tokenStr) {
  const name = getUserNameFromJwt(tokenStr);
  if (name == undefined) return undefined;
  return (await db.collection("users").where("name", "==", name).get()).docs[0];
}


fastify.get("/", async (req, res) => {
  if ((await getUserFromJwt(req.cookies.jwt)) == undefined) return res.redirect("/login").send();

  return res.render("/index", {styles: "/public/index.css", userIsLogged: true});
});


fastify.get("/login", async (req, res) => {
  if ((await getUserFromJwt(req.cookies.jwt)) != undefined) return res.redirect("/").send();
  
  return res.render("/login/index", {styles: "public/login/index.css", userIsLogged: false});
});

fastify.post("/login", async (req, res) => {
  if ((await getUserFromJwt(req.cookies.jwt)) != undefined) return res.redirect("/").send();

  const users = await db.collection("users").where("name", "==", req.body.username).get();
  const user = users.docs[0];

  if (user == undefined) {
    return res.status(404).render("/login/index", {styles: "public/login/index.css", userIsLogged: false, message: "Usuário não encontrado"});
  }

  if (await bcrypt.compare(req.body.password.toString(), user.get("pass_hash"))) {
    var token = jwt.sign({
      iss: JWT_ISS,
      sub: user.get("name")
    }, JWT_PRIVATE_KEY, {algorithm: 'HS256'});

    res.setCookie("jwt", token, {
      domain: DOMAIN,
      path: "/",
      secure: true,
      httpOnly: true,
      maxAge: 2592000,
      sameSite: "strict"
    });

    return res.status(302).redirect("/").send();

  } else {
    return res.status(401).render("/login/index", {styles: "public/login/index.css", userIsLogged: false, message: "Senha Incorreta"});
  }
});

fastify.get("/registrar", async (req, res) => {
  if ((await getUserFromJwt(req.cookies.jwt)) != undefined) return res.redirect("/").send();

  return res.render("/registrar/index", {styles: "/public/login/index.css", userIsLogged: false});
});

fastify.post("/registrar", async (req, res) => {
  if ((await getUserFromJwt(req.cookies.jwt)) != undefined) return res.redirect("/").send();

  const users = db.collection("users")
  const foundUsers = await users.where("name", "==", req.body.username).get();

  if (foundUsers.docs.length > 0) {
    return res.status(403).render("/registrar/index", {styles: "/public/login/index.css", userIsLogged: false, message: "Usuário com este nome já existe"});
  }

  const pass_hash = await bcrypt.hash(req.body.password, await bcrypt.genSalt(12));

  users.add({
    name: req.body.username,
    pass_hash: pass_hash,
    favorites: [],
  });

  return res.status(302).redirect("/").send();
});


//not tested
fastify.post("/addToFavorites", async (req, res) => {
  const user = await getUserFromJwt(req.cookies.jwt);

  if (user == undefined) {
    return res.status(401).redirect("/login").send();
  }

  if (req.body.joke == undefined) {
    return res.status(400).send("joke is undefined");
  }

  let arr = user.get("favorites");
  arr.push(req.body.joke);

  await db.collection("users").doc(user.id).update({favorites: arr});

  return res.status(201).send();
});

fastify.post("/removeFromFavorites/:id", async (req, res) => {
  const user = await getUserFromJwt(req.cookies.jwt);
  if (user == undefined) {
    return res.status(401).redirect("/login").send();
  }

  const {id} = req.params;

  let arr = user.get("favorites");
  arr.splice(id, id+1);

  await db.collection("users").doc(user.id).update({favorites: arr});

  return res.status(202).send();
});

fastify.get("/favoritos", async (req, res) => {
  const user = await getUserFromJwt(req.cookies.jwt);
  if (user == undefined) {
    return res.status(401).redirect("/login").send();
  }

  return res.render("/favoritos/index", {favorites: user.get("favorites"), styles: "/public/favorites/index.css", userIsLogged: true});
});


fastify.get("/logout", async (req, res) => {
  return res.setCookie("jwt", "", {maxAge: 0}).redirect("/login").send();
});

fastify.get("/removeAccount", async (req, res) => {
  const user = await getUserFromJwt(req.cookies.jwt);
  if (user == undefined) {
    return res.status(401).redirect("/login").send();
  }

  await db.collection("users").doc(user.id).delete();

  return res.setCookie("jwt", "", {maxAge: 0}).redirect("/login").send();
});






fastify.listen({port: PORT, host: "0.0.0.0"}).then(() => {
  console.log(`Server running at 0.0.0.0:${PORT}`);
});