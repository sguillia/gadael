'use strict';


describe('request absence account rest service', function() {


    var server, userAdmin, userAccount, right1, right2, collection, request1;


    beforeEach(function(done) {
        var helpers = require('../mockServer');

        helpers.mockServer('accountRequestAbsence', function(_mockServer) {
            server = _mockServer;
            done();
        });
    });


    it('verify the mock server', function(done) {
        expect(server.app).toBeDefined();
        done();
    });


    it('request list of current requests as anonymous', function(done) {
        server.get('/rest/account/requests', {}, function(res) {
            expect(res.statusCode).toEqual(401);
            done();
        });
    });


    // admin actions


    it('Create admin session needed for prerequisits', function(done) {
        server.createAdminSession().then(function(user) {
            userAdmin = user;
            expect(userAdmin.roles.admin).toBeDefined();
            done();
        });
    });


    it('Create a collection', function(done) {
        server.post('/rest/admin/collections', {
            name: 'Test collection',
            attendance: 100
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            collection = body;
            delete collection.$outcome;
            done();
        });
    });


    it('create Right 1', function(done) {
        server.post('/rest/admin/rights', {
            name: 'Right 1',
            quantity: 25,
            quantity_unit: 'D'
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            right1 = body;
            expect(right1._id).toBeDefined();
            done();
        });
    });

    it('link the right1 to collection', function(done) {
        server.post('/rest/admin/beneficiaries', {
            ref: 'RightCollection',
            document: collection._id,
            right: right1
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('create renewal 1', function(done) {
        server.post('/rest/admin/rightrenewals', {
            right: right1._id,
            start: new Date(2015,1,1).toJSON(),
            finish: new Date(2016,1,1).toJSON()
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('create Right 2', function(done) {
        server.post('/rest/admin/rights', {
            name: 'Right 2',
            quantity: 25,
            quantity_unit: 'D'
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            right2 = body;
            expect(right2._id).toBeDefined();
            done();
        });
    });


    it('link the right2 to collection', function(done) {
        server.post('/rest/admin/beneficiaries', {
            ref: 'RightCollection',
            document: collection._id,
            right: right2
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });




    it('create renewal 2', function(done) {
        server.post('/rest/admin/rightrenewals', {
            right: right2._id,
            start: new Date(2015,1,1).toJSON(),
            finish: new Date(2016,1,1).toJSON()
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('create the user account', function(done) {
        server.createUserAccount()
        .then(function(account) {
            userAccount = account;
            done();

        });

    });


    it('link user to collection', function(done) {
        server.post('/rest/admin/accountcollections', {
            user: userAccount.user._id,
            rightCollection: collection,
            from: new Date(2014,1,1).toJSON()
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('logout', function(done) {
        server.get('/rest/logout', {}, function(res) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    // account session part


    it('Authenticate user account session', function(done) {
        expect(userAccount.user.roles.account).toBeDefined();
        server.authenticateAccount(userAccount).then(function() {
            done();
        });

    });



    it('request list of current requests as account', function(done) {
        server.get('/rest/account/requests', {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(0);
            done();
        });
    });

    var where = {
        dtstart: new Date(2015,1,1, 8).toJSON(),
        dtend: new Date(2015,1,1, 18).toJSON()
    };

    it('request account current collection', function(done) {
        server.get('/rest/account/collection', where, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.name).toBeDefined();
            done();
        });
    });



    it('request list of accessibles rights', function(done) {
        server.get('/rest/account/accountrights', where, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(2);

            // check quantities of renewal, with 0 consumed, the quantities should be defaults
            expect(body[0].available_quantity).toEqual(right1.quantity);
            expect(body[1].available_quantity).toEqual(right2.quantity);

            done();
        });
    });


    it('Create absence', function(done) {

        var distribution = [
            {
                right: right1._id,
                quantity: 1,
                event: {
                    dtstart: new Date(2015,1,1, 8).toJSON(),
                    dtend: new Date(2015,1,1, 18).toJSON()
                }
            },
            {
                right: right2._id,
                quantity: 1,
                event: {
                    dtstart: new Date(2015,1,1, 8).toJSON(),
                    dtend: new Date(2015,1,1, 18).toJSON()
                }
            }
        ];

        server.post('/rest/account/requests', { absence: { distribution: distribution } }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body._id).toBeDefined();
            expect(body.absence.distribution.length).toEqual(2);
            request1 = body;
            done();
        });
    });

    it('request list of current requests as account', function(done) {
        server.get('/rest/account/requests', {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(1);
            done();
        });
    });

    it('get one request', function(done) {
        server.get('/rest/account/requests/'+request1._id, {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.absence.distribution).toBeDefined();
            expect(body._id).toEqual(request1._id);
            expect(body.absence.distribution[0].consumedQuantity).toEqual(1);
            done();
        });
    });


    it('update request distribution', function(done) {

        var distribution = [
            {
                right: right1._id,
                quantity: 5,
                event: {
                    dtstart: new Date(2015,1,1, 8).toJSON(),
                    dtend: new Date(2015,1,5, 18).toJSON()
                }
            }
        ];

        server.put('/rest/account/requests/'+request1._id, { absence: { distribution: distribution } }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body._id).toBeDefined();
            expect(body.absence.distribution.length).toEqual(1);
            expect(body.absence.rightCollection).toBeDefined();
            done();
        });
    });


/*
    it('forbid creation of out of bounds request', function(done) {

        var distribution = [
            {
                right: right1._id,
                quantity: 22, // there should be only 20 days left
                event: {
                    dtstart: new Date(2015,1,1, 8).toJSON(),
                    dtend: new Date(2015,1,22, 18).toJSON()
                }
            }
        ];

        server.post('/rest/account/requests', { absence: { distribution: distribution } }, function(res, body) {
            expect(res.statusCode).toEqual(500);
            expect(body.$outcome).toBeDefined();
            done();
        });
    });


    it('delete a request', function(done) {
        server.delete('/rest/account/requests/'+request1._id, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('request list of current requests as account', function(done) {
        server.get('/rest/account/requests', {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(0);
            done();
        });
    });


    it('request list of current deleted requests as account', function(done) {
        server.get('/rest/account/requests', { deleted:1 }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(1);
            done();
        });
    });
*/


    it('logout', function(done) {
        server.get('/rest/logout', {}, function(res) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('close the mock server', function(done) {
        server.close(done);
    });


});