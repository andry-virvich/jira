
//-------------------------------------------------------
//-- Models

var Issue = Backbone.Model.extend({
	initialize: function(issue) {
		var this_ = this;
		this.set({
			'key': issue['key'],
			'duedate': new Date(issue['fields']['duedate']),
			'estimate': parseInt(issue['fields']['timetracking']['originalEstimateSeconds']),
			'summary': issue['fields']['summary'],
			'assignee': issue['fields']['assignee'],
			'reporter': issue['fields']['reporter'],
			'issuetype': issue['fields']['issuetype'],
			'priority': issue['fields']['priority'],
			'status': issue['fields']['status'],
			'progress': issue['fields']['progress'],
			'url': issue['self'].replace(/\/rest\/api\/2\/issue\/.*/, '/browse/' + issue['key'])
		});

		this.on('changeDueDate', function(e) {
			app.server.api.updateIssue(this.get('self'), {
				'duedate': moment(e.start).format('YYYY-MM-DD')
			}, function() {
				this_.trigger('updated');
			});
		});

		this.on('changeEstiamte', function(e) {
			app.server.api.updateIssue(this.get('self'), {
				'timetracking': {
					'originalEstimateSeconds': (e.end - e.start)/1000
				}
			}, function() {
				this_.trigger('updated');
			});
		});

		this.on('startProgress', function(e) {
			this.set({'started': new Date()});
			this_.trigger('updated');
		})
	}
});

var Issues = Backbone.Collection.extend({
	'model': Issue
});

var Filter = Backbone.Model.extend({
	'issues': new Issues(),
	'initialize': function(filter) {
		this.set({
			'name': filter['name'],
			'jql': filter['jql'],
			'type': filter['type'] || app.FILTER_TYPE_TABLE
		});

		this['view'] = new FilterView({
			'model': this
		});

		this.update();
		this.collection.trigger('created', this);
	},
	'update': function() {
		var this_ = this;
		this.collection.server.api.executeJQL(this.get('jql'), function(issues) {
			this_['issues'] = new Issues(issues);
			this_['issues'].on('updated', function() {
				this_.trigger('updated', this_);
			})
			this_.trigger('updated', this_);
		});
	}
});

var Filters = Backbone.Collection.extend({ 
    model: Filter
});


var ServerModel = Backbone.Model.extend({
	filters: new Filters,
	api: null,
	sync: function(cmd, server){
		if (cmd === 'create') {
			localStorage.setItem('url', server.get('url'));
			localStorage.setItem('token', server.get('token'));
			localStorage.setItem('username', server.get('username'));
		} else if (cmd === 'read') {
			server.set({
				'url': localStorage.getItem('url'),
				'token': localStorage.getItem('token'),
				'username': localStorage.getItem('username')
			});
		}
	},
	initialize: function() {
		this.filters.server = this;
	
		this.on('connected', function() {
			this.filters.add([{
				'name': 'Assigned to me',
				'jql': 'assignee = currentUser() AND resolution = Unresolved ORDER BY dueDate ASC'
			}, {
				'type': app.FILTER_TYPE_CALENDAR,
				'name': 'Issues created by me during this month',
				'jql': 'assignee = currentUser() AND created > startOfMonth()'
			}]);
		});

		this.on('login', function(e) {
			var self = this;
			var api = new JIRA(e.url);
			api.login(e.username, e.password, function(res, data){
				if (res) {
					self.set({
						'url': e.url,
						'token': data,
						'username': e.username
					});
					self.save();
					self.api = api;
					self.trigger('connected');
				} else {
					app.server.trigger('login-error', data)
				}
			})
		});
	},
	load: function() {
		var this_ = this;
		this.fetch();
		if (this.get('url') && this.get('token')) {
			var api = new JIRA(this.get('url'), this.get('url'));
			api.checkAuthorization(function(res, msg) {
				if (res) {
					this_.api = api;
					this_.trigger('connected');
				} else {
					this_.trigger('disconnected');
					if (msg) {
						this_.trigger('connection-error', msg);
					}
				}
			});
		} else {
			this.trigger('disconnected');
		}
	}
});