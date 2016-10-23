var request = require('request');
var rssReader = require('feed-read');
var properties = require('../config/properties');
var User = require('../model/user');

exports.tokenVerification = function (req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === properties.facebook_challenge) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
};

exports.handleMessage = function (req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    // receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    // receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
};

function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var messageId = message.mid;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;

    if (messageText) {

        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.
        switch (messageText.toLowerCase().replace(' ', '')) {
            case 'image':
                // sendImageMessage(senderID);
                break;

            case 'button':
                // sendButtonMessage(senderID);
                break;

            case 'generic':
                sendGenericMessage(senderID);
                break;

            case 'receipt':
                // sendReceiptMessage(senderID);
                break;

            case 'showmore':
                _getArticles(function (err, articles) {
                    if (err) {
                        console.log(err);
                    } else {
                        var maxArticles = Math.min(articles.length, 5);
                        for (var i = 0; i < maxArticles; i++) {
                            _sendArticleMessage(senderID, articles[i]);
                        }
                    }
                });
                break;
            case "/subscribe":
                subscribeUser(senderID);
                break;

            case "/unsubscribe":
                unsubscribeUser(senderID);
                break;

            case "/subscribestatus":
                subscribeStatus(senderID);
                break;

            default:
                callWitAI(messageText, function (err, intent) {
                    handleIntent(intent,senderID);
                });
            // _getArticles(function (err, articles) {
            //     if (err) {
            //         console.log(err);
            //     } else {
            //         _sendArticleMessage(senderID, articles[0]);
            //     }
            // })

        }
    } else if (messageAttachments) {
        sendTextMessage(senderID, "Message with attachment received");
    }
}

function handleIntent(intent, recipientId) {
    switch (intent) {
        // case "jokes":
        //     sendTextMessage(sender, "Today a man knocked on my door and asked for a small donation towards the local swimming pool. I gave him a glass of water.")
        //     break;
        case "greeting":
            sendTextMessage(recipientId, "Hi!");
            break;
        case "identification":
            sendTextMessage(recipientId, "I'm Yukime.");
            break;
        case "more news":
            _getArticles(function (err, articles) {
                if (err) {
                    console.log(err);
                } else {
                    sendTextMessage(recipientId, "How about these?");
                    var maxArticles = Math.min(articles.length, 5);
                    for (var i = 0; i < maxArticles; i++) {
                        _sendArticleMessage(recipientId, articles[i]);
                    }
                }
            });
            break;
        case "general news":
            _getArticles(function (err, articles) {
                if (err) {
                    console.log(err);
                } else {
                    sendTextMessage(recipientId, "Here's what I found...");
                    _sendArticleMessage(recipientId, articles[0]);
                }
            });
            break;
        case "local news":
            _getArticles(function (err, articles) {
                if (err) {
                    console.log(err);
                } else {
                    sendTextMessage(recipientId, "I don't know local news yet, but I found these...");
                    _sendArticleMessage(recipientId, articles[0]);
                }
            });
            break;
        default:
            sendTextMessage(recipientId, "I'm still learning honey \xF0\x9F\x98\x98");
            break;

    }
}

function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

    // When a postback is called, we'll send a message back to the sender to
    // let them know it was successful
    sendTextMessage(senderID, "Postback called");
}

function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    callSendAPI(messageData);
}

function _sendArticleMessage(recipientId, article) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [
                        {
                            title: article.title,
                            subtitle: article.published.toString(),
                            item_url: article.link
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

exports.sendArticleMessage = function (recipientId, article) {
    _sendArticleMessage(recipientId, article);
}

function callSendAPI(messageData) {
    request({
        uri: properties.facebook_message_endpoint,
        // page access token
        qs: {access_token: properties.facebook_token},
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            console.log("Successfully sent generic message with id %s to recipient %s",
                messageId, recipientId);
        } else {
            console.error("Unable to send message.");
            console.error(response);
            console.error(error);
        }
    });
}


function _getArticles(callback) {
    rssReader(properties.google_news_endpoint, function (err, articles) {
        if (err) {
            callback(err);
        } else {
            if (articles.length > 0) {
                callback(null, articles);
            } else {
                callback("no articles recerived");
            }
        }
    })
}

exports.getArticles = function (callback) {
    _getArticles(callback);
};

function sendGenericMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "rift",
                        subtitle: "Next-generation virtual reality",
                        item_url: "https://www.oculus.com/en-us/rift/",
                        image_url: "http://messengerdemo.parseapp.com/img/rift.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/rift/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for first bubble"
                        }]
                    }, {
                        title: "touch",
                        subtitle: "Your Hands, Now in VR",
                        item_url: "https://www.oculus.com/en-us/touch/",
                        image_url: "http://messengerdemo.parseapp.com/img/touch.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/touch/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for second bubble"
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

function subscribeUser(id) {
    var newUser = new User({
        fb_id: id
    });

    User.findOneAndUpdate({fb_id: newUser.fb_id}, {fb_id: newUser.fb_id}, {upsert: true}, function (err, user) {
        if (err) {
            sendTextMessage(id, "There was error subscibing you for daily articles");
        } else {
            console.log('User saved successfully!');
            sendTextMessage(newUser.fb_id, "You've been subcribed");
        }
    });
}

function unsubscribeUser(id) {
    User.findOneAndRemove({fb_id: id}, function (err, user) {
        if (err) {
            sendTextMessage(id, "There was error unsubscibing you for daily articles");
        } else {
            console.log('User saved successfully!');
            sendTextMessage(id, "You've been unsubcribed");
        }
    });
}

function subscribeStatus(id) {
    User.findOne({fb_id: id}, function (err, user) {
        console.log(user);
        var status = false;
        if (err) {
            console.log(err);
        } else {
            if (user != null) {
                status = true;
            }
            var subscribedText = "Your subscribed status is " + status;
            sendTextMessage(id, subscribedText);
        }
    })
}

function callWitAI(query, callback) {
    query = encodeURIComponent(query);
    request({
        uri: properties.wit_endpoint + query,
        qs: {access_token: properties.wit_token},
        method: 'GET'
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log("Successfully got %s", response.body);
            try {
                body = JSON.parse(response.body)
                var intent = body["entities"]["intent"][0]["value"]
                callback(null, intent)
            } catch (e) {
                callback(e)
            }
        } else {
            console.log(response.statusCode)
            console.error("Unable to send message. %s", error);
            callback(error)
        }
    });
}