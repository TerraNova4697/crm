const express = require('express')
dotenv = require('dotenv').config();
const axios = require('axios').default
const fs_sync = require('fs')
const fs = require('fs/promises')

const app = express()
const PORT = 3000

let refreshToken = ''
let accessToken = ''

// Чтение файлов токенов и обновление
try {
    const data = fs_sync.readFileSync('./refreshToken.txt', 'utf-8')
    refreshToken = data
} catch(err) {
    console.log(err)
}
try {
    const data = fs_sync.readFileSync('./accessToken.txt', 'utf-8')
    accessToken = data
} catch(err) {
    console.log(err)
}

const SECRET_KEY = process.env.SECRET_KEY
const INTEGRATION_ID = process.env.INTEGRATION_ID
const REDIRECT_URI = process.env.REDIRECT_URI
const BASE_URL = process.env.BASE_URL
const PIPELINE_ID = 7215790
const FIRST_STATUS_ID = 60222734



app.get('/', (req, res) => {
    if (res && res.length > 0) {
        if (process.env.EXPIRATION_TIME > Date.now()) {
            handleRequest(req, res)
                .catch(err => { console.log(err) })
                .then(resolve => { res.send('OK') })
        } else {
            requestToken()
                .then(() => {
                    // Обрабатываем запрос
                    handleRequest(req, res)
                        .catch(err => { console.log(err) })
                        .then(resolve => { res.send('OK') })
                })
        }
    } else {
        res.send('Пожалуйста, передайте query параметры')
    }
})

app.listen(PORT, () => {

    // Обновляем токен если сервер упал
    axios.post(BASE_URL + `/oauth2/access_token`, {
        client_id: INTEGRATION_ID,
        client_secret: SECRET_KEY,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: REDIRECT_URI
    }).then((res) => {
        // Обновляем exiration_time, access и refresh токены
        process.env.EXPIRATION_TIME = Date.now() + res.data.expires_in
        writeTokens(res.data.access_token, res.data.refresh_token)
    })
    .catch(error => console.log(error))
    console.log(`Server is up and running on port ${PORT}`)
})

async function handleRequest(req, res) {
    const {name, email, phone} = req.query

    // Проверяем есть ли уже такой контакт
    return findContact(email, phone)
        .then(response => {

            // Если контакт найден, то обновляем его
            if (response.data) {
                old_contact = response.data._embedded.contacts[0]
                updateContact(old_contact, name, email, phone)
                    .catch(err => console.log(err))
                    .then(response => {

                        // Создаем сделку
                        createLead(response.data)
                            .catch(err => console.log(err))
                            .then(response => console.log('Сделка добавлена'))
                        })
                        // .catch(err => console.log(err))
                        // .then(response => {
                        //     console.log('Сделка создана')
                        // })

            // Если такого контакта в базе нет, он создается
            } else {
                createContact(name, email, phone)
                    .catch(err => console.log(err))
                    .then(response => {

                        // А потом с ним создается сделка
                        createLead(response.data._embedded.contacts[0])
                            .catch(err => console.log(err))
                            .then(response => console.log('Сделка добавлена'))
                    })
            }

        }).catch(err => console.log(err))
}

function writeTokens(newAccessToken, newRefreshToken) {
    accessToken = newAccessToken
    refreshToken = newRefreshToken
    fs.writeFile('./accessToken.txt', accessToken)
        .catch(error => console.log(error))

    fs.writeFile('./refreshToken.txt', newRefreshToken)
        .catch(error => console.log(error))
}

async function findContact(email, phone) {
    return axios.get(BASE_URL + `/api/v4/contacts?query=${email}&limit=1`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    })
}

async function requestToken() {
    return axios.post(BASE_URL + `/oauth2/access_token`, {
        client_id: INTEGRATION_ID,
        client_secret: SECRET_KEY,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: REDIRECT_URI
    }).then((res) => {
        // Обновляем exiration_time, access и refresh токены
        process.env.EXPIRATION_TIME = Date.now() + res.data.expires_in
        writeTokens(res.data.access_token, res.data.refresh_token)
    })
    .catch(error => console.log(error))
}

async function updateContact(old, name, email, phone) {
    let fio = name.split(' ')
    let update_contact = {
        id: old.id,
        name: name,
        first_name: fio[0],
        last_name: fio[1],
        custom_fields_values: [
            {
                field_code: 'PHONE',
                values: [
                    {
                        value: phone
                    }
                ]
            },
            {
                field_code: 'EMAIL',
                values: [
                    {
                        value: email
                    }
                ]
            }
        ]
    }

    return axios.patch(BASE_URL + `/api/v4/contacts/${old.id}`, JSON.stringify(update_contact), {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    })
}

async function createContact(name, email, phone) {
    const fio = name.split(' ')
    let contact = {
        name: name,
        first_name: fio[0],
        last_name: fio[1],
        custom_fields_values: [
            {
                field_code: 'PHONE',
                values: [
                    {
                        value: phone
                    }
                ]
            },
            {
                field_code: 'EMAIL',
                values: [
                    {
                        value: email
                    }
                ]
            }
        ]
    }
    return axios.post(BASE_URL + `/api/v4/contacts`, JSON.stringify([contact]), {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    })
}

async function createLead(contact) {
    const lead = {
        name: contact.name,
        pipeline_id: PIPELINE_ID,
        _embedded: {
            contacts: [
                contact
            ]
        }
    }
    return axios.post(BASE_URL + `/api/v4/leads/complex`, JSON.stringify([lead]), {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    })
}