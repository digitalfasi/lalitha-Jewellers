"""fill shop state codes from GSTIN

Revision ID: 2312d84cc6b1
Revises: c536b379df22
Create Date: 2026-11-18 13:21:34.791063

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2312d84cc6b1'
down_revision: Union[str, None] = 'c536b379df22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Shops saved before state_code existed: take it from the GSTIN's first two
# digits (the GST state code), where the GSTIN is filled in.
def upgrade() -> None:
    op.execute(
        "UPDATE shops SET state_code = substr(gstin, 1, 2) "
        "WHERE state_code IS NULL AND gstin IS NOT NULL AND length(gstin) = 15"
    )


def downgrade() -> None:
    pass  # nothing to undo: the codes are correct either way
