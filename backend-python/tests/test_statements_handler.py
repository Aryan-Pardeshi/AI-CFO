"""AWS-boundary tests for authenticated statement routes."""

import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handlers.finance as fin


def _event(method, path, sub="user-a", body=None):
    event = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": {"sub": sub}}},
        },
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


class ConditionalCheckFailed(Exception):
    """Mimics botocore's ClientError shape for a failed conditional write."""

    def __init__(self):
        super().__init__("conditional check failed")
        self.response = {"Error": {"Code": "ConditionalCheckFailedException"}}


class NoSuchKey(Exception):
    def __init__(self):
        super().__init__("no such key")
        self.response = {"Error": {"Code": "NoSuchKey"}}


class Body:
    def __init__(self, value):
        self.value = value

    def read(self, amount=-1):
        return self.value if amount == -1 else self.value[:amount]


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.puts = []

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        return f"https://upload.test/{Params['Key']}"

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise NoSuchKey()
        return {"Body": Body(self.objects[Key])}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]


class FakeTable:
    def __init__(self, name, tables):
        self.name = name
        self.tables = tables
        self.puts = []
        self.query_calls = []

    def put_item(self, Item, **kwargs):
        key = (Item["user_id"], Item.get("job_id") or Item.get("txn_sk"))
        if "attribute_not_exists" in str(kwargs.get("ConditionExpression", "")) and key in self.tables[self.name]:
            raise ConditionalCheckFailed()
        self.puts.append(Item)
        self.tables[self.name][key] = Item

    def get_item(self, Key):
        return {"Item": self.tables[self.name].get((Key["user_id"], Key.get("job_id") or Key.get("txn_sk")))}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        user_id = kwargs["KeyConditionExpression"]._values[1]
        return {"Items": [item for item in self.tables[self.name].values() if item.get("user_id") == user_id]}

    def update_item(self, Key, **kwargs):
        item = self.tables[self.name][(Key["user_id"], Key["job_id"])]
        item.update(kwargs.get("Item", {}))
        values = kwargs.get("ExpressionAttributeValues", {})
        for name, value in values.items():
            item[name.lstrip(":")] = value


class FakeDynamo:
    def __init__(self):
        self.tables = defaultdict(dict)
        self.instances = {}

    def Table(self, name):
        if name not in self.instances:
            self.instances[name] = FakeTable(name, self.tables)
        return self.instances[name]


def _configure(monkeypatch):
    dynamo = FakeDynamo()
    s3 = FakeS3()
    monkeypatch.setattr(fin, "_dynamo", dynamo)
    monkeypatch.setattr(fin, "_s3", s3, raising=False)
    monkeypatch.setenv("DATA_BUCKET", "data-bucket")
    monkeypatch.setenv("STATEMENT_JOBS_TABLE", "jobs")
    monkeypatch.setenv("TRANSACTIONS_TABLE", "transactions")
    return dynamo, s3


def test_create_statement_job_scopes_presigned_key_to_jwt_sub(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    response = fin.handler(_event("POST", "/statements", body={
        "job_id": "11111111-1111-4111-8111-111111111111",
        "file_name": "../salary report.csv",
        "input_type": "csv",
        "content_type": "text/csv",
    }), None)

    assert response["statusCode"] == 201
    body = json.loads(response["body"])
    assert body["upload"]["key"].startswith("statements/user-a/11111111-1111-4111-8111-111111111111/")
    assert "victim" not in body["upload"]["key"]
    job = next(iter(dynamo.tables["jobs"].values()))
    assert job["user_id"] == "user-a"
    assert job["file_name"] == "salary_report.csv"


def test_create_statement_rejects_client_identity_fields(monkeypatch):
    _configure(monkeypatch)
    response = fin.handler(_event("POST", "/statements", body={
        "file_name": "statement.csv", "input_type": "csv", "content_type": "text/csv",
        "user_id": "victim",
    }), None)

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "VALIDATION_ERROR"


def test_process_writes_review_only_and_does_not_write_transactions(monkeypatch):
    dynamo, s3 = _configure(monkeypatch)
    create = fin.handler(_event("POST", "/statements", body={
        "file_name": "statement.csv", "input_type": "csv", "content_type": "text/csv",
    }), None)
    job_id = json.loads(create["body"])["job_id"]
    job = dynamo.tables["jobs"][("user-a", job_id)]
    s3.objects[job["s3_key"]] = (
        "date,description,amount,direction\n2026-09-01,Salary,85000,CREDIT\n"
    ).encode()

    response = fin.handler(_event("POST", f"/statements/{job_id}/process"), None)

    assert response["statusCode"] == 202
    assert json.loads(response["body"])["status"] == "REVIEW_REQUIRED"
    assert "transactions" not in dynamo.instances or dynamo.instances["transactions"].puts == []
    assert len(s3.puts) == 1


def test_get_statement_cannot_read_another_users_job(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    dynamo.tables["jobs"][("user-a", "job-a")] = {
        "user_id": "user-a", "job_id": "job-a", "status": "REVIEW_REQUIRED",
        "review_s3_key": "statements/user-a/job-a/review.json",
    }

    response = fin.handler(_event("GET", "/statements/job-a", sub="user-b"), None)

    assert response["statusCode"] == 404


def test_commit_is_review_gated_and_idempotent(monkeypatch):
    dynamo, s3 = _configure(monkeypatch)
    job_id = "job-commit"
    review_key = f"statements/user-a/{job_id}/review.json"
    dynamo.tables["jobs"][("user-a", job_id)] = {
        "user_id": "user-a", "job_id": job_id, "status": "REVIEW_REQUIRED",
        "review_s3_key": review_key,
    }
    rows = [{
        "txn_id": "row-1", "txn_date": "2026-09-01", "description": "Salary",
        "amount_paise": 8500000, "direction": "CREDIT", "category": "INCOME",
        "category_source": "rule", "balance_paise": None,
    }]
    s3.objects[review_key] = json.dumps(rows).encode()

    first = fin.handler(_event("POST", f"/statements/{job_id}/commit", body={"reviewed_rows": rows}), None)
    second = fin.handler(_event("POST", f"/statements/{job_id}/commit", body={"confirm_stored_rows": True}), None)

    assert first["statusCode"] == 200
    assert second["statusCode"] == 200
    assert len(dynamo.instances["transactions"].puts) == 1
    assert dynamo.tables["jobs"][("user-a", job_id)]["status"] == "COMMITTED"


def test_cashflow_summary_queries_only_authenticated_users(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    dynamo.tables["transactions"][("user-a", "2026-09-01#row-1")] = {
        "user_id": "user-a", "txn_sk": "2026-09-01#row-1", "txn_date": "2026-09-01",
        "description": "Salary", "amount_paise": 10000, "direction": "CREDIT",
    }
    dynamo.tables["transactions"][("user-b", "2026-09-01#row-2")] = {
        "user_id": "user-b", "txn_sk": "2026-09-01#row-2", "txn_date": "2026-09-01",
        "description": "Salary", "amount_paise": 999999, "direction": "CREDIT",
    }

    response = fin.handler(_event("GET", "/cashflow/summary", sub="user-a"), None)

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["totals"]["income_paise"] == 10000
    assert len(dynamo.instances["transactions"].query_calls) == 1


def test_create_statement_does_not_overwrite_an_existing_job(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    body = {
        "job_id": "22222222-2222-4222-8222-222222222222", "file_name": "a.csv",
        "input_type": "csv", "content_type": "text/csv",
    }
    first = fin.handler(_event("POST", "/statements", body=body), None)
    key = ("user-a", body["job_id"])
    dynamo.tables["jobs"][key]["status"] = "COMMITTED"

    second = fin.handler(_event("POST", "/statements", body=body), None)

    assert first["statusCode"] == 201
    assert second["statusCode"] == 409
    assert json.loads(second["body"])["error"]["code"] == "CONFLICT"
    assert dynamo.tables["jobs"][key]["status"] == "COMMITTED"


def test_process_of_a_job_with_no_uploaded_file_is_a_client_error(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    create = fin.handler(_event("POST", "/statements", body={
        "file_name": "statement.csv", "input_type": "csv", "content_type": "text/csv",
    }), None)
    job_id = json.loads(create["body"])["job_id"]

    response = fin.handler(_event("POST", f"/statements/{job_id}/process"), None)

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "VALIDATION_ERROR"


def test_process_of_a_committed_job_is_a_conflict(monkeypatch):
    dynamo, _ = _configure(monkeypatch)
    dynamo.tables["jobs"][("user-a", "job-done")] = {
        "user_id": "user-a", "job_id": "job-done", "status": "COMMITTED",
        "s3_key": "statements/user-a/job-done/a.csv", "review_s3_key": "statements/user-a/job-done/review.json",
    }

    response = fin.handler(_event("POST", "/statements/job-done/process"), None)

    assert response["statusCode"] == 409


def test_an_unexpected_keyerror_is_a_server_error_not_a_missing_statement(monkeypatch):
    _configure(monkeypatch)

    def boom(user_id):
        raise KeyError("txn_date")

    monkeypatch.setattr(fin, "cashflow_summary_route", boom)
    response = fin.handler(_event("GET", "/cashflow/summary"), None)

    assert response["statusCode"] == 500
    assert json.loads(response["body"])["error"]["code"] == "INTERNAL"
