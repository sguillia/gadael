'use strict';

const api = {
    user: require('../../../../api/User.api.js')
};



describe('Compulsory leaves admin rest service', function() {


    let server;

    let compulsoryleave;

    let randomUser;

    let right1;

    let collection;

    let request;


    beforeEach(function(done) {

        var helpers = require('../mockServer');

        helpers.mockServer('adminCompulsoryleaves', function(_mockServer) {
            server = _mockServer;
            done();
        });
    });


    it('verify the mock server', function(done) {
        expect(server.app).toBeDefined();
        done();
    });



    it('Create admin session', function(done) {
        server.createAdminSession().then(function() {
            done();
        });
    });


    it('request compulsory leaves list as admin', function(done) {
        server.get('/rest/admin/compulsoryleaves', {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body.length).toEqual(0);
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

    it('link the right to collection', function(done) {
        server.post('/rest/admin/beneficiaries', {
            ref: 'RightCollection',
            document: collection._id,
            right: right1
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    it('create renewal', function(done) {
        server.post('/rest/admin/rightrenewals', {
            right: right1._id,
            start: new Date(2015,0,1).toJSON(),
            finish: new Date(2016,0,1).toJSON()
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            right1.renewal = body;
            done();
        });
    });


    it("create random account", function(done) {
		api.user.createRandomAccount(server.app).then(function(randomAccount) {
            expect(randomAccount.user.email).toBeDefined();
            expect(randomAccount.user.roles.account).toBeDefined();
            randomUser = randomAccount;
			done();
		});
	});


    it('link random user to collection', function(done) {
        server.post('/rest/admin/accountcollections', {
            user: randomUser.user._id,
            rightCollection: collection,
            from: new Date(2014,1,1).toJSON()
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            done();
        });
    });


    const dtstart = new Date(2015, 11, 15, 0,0,0,0);
    const dtend = new Date(2015, 11, 31, 0,0,0,0);



    it('create new compulsory leave', function(done) {
        server.post('/rest/admin/compulsoryleaves', {
            name: 'compulsory leave test',
            dtstart: dtstart,
            dtend: dtend,
            right: right1._id,
            collections: [collection._id],
            departments: []
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body._id).toBeDefined();
            server.expectSuccess(body);

            compulsoryleave = body._id;

            done();
        });
    });


    it ('update compulsory leave and create requests', function(done) {

        server.put('/rest/admin/compulsoryleaves/'+compulsoryleave, {
            name: 'compulsory leave test',
            dtstart: dtstart,
            dtend: dtend,
            right: right1._id,
            collections: [collection._id],
            departments: [],
            requests: [
                {
                    user: {
                        id: randomUser.user._id,
                        name: randomUser.user.lastname+' '+randomUser.user.firstname
                    }
                }
            ]
        }, function(res, body) {
            expect(res.statusCode).toEqual(200);
            server.expectSuccess(body);
            expect(body.requests[0].request).toBeDefined();
            expect(body.requests[0].request.length).toEqual(24);
            request = body.requests[0].request;
            done();
        });
    });


    it('check the created request', function (done) {
        server.get('/rest/admin/requests/'+request, {}, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body._id).toEqual(request);
            body.events.forEach(event => {

                let evtstart = new Date(event.dtstart);
                let evtend = new Date(event.dtend);

                expect(evtstart.getTime() >= dtstart.getTime()).toBeTruthy();
                expect(evtend.getTime() <= dtend.getTime()).toBeTruthy();
            });

            done();
        });
    });


    it('delete the compulsory leave', function(done) {
        server.delete('/rest/admin/compulsoryleaves/'+compulsoryleave, function(res, body) {
            expect(res.statusCode).toEqual(200);
            expect(body._id).toEqual(compulsoryleave);
            expect(body.name).toEqual('compulsory leave test');
            server.expectSuccess(body);
            done();
        });
    });


    it('check the deleted request', function (done) {
        server.get('/rest/admin/requests/'+request, {}, function(res, body) {
            expect(res.statusCode).toEqual(404);
            done();
        });
    });


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
